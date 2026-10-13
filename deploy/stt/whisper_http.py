import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(ROOT, 'whisper-cli')
MODEL = os.environ.get('PARLZ_STT_MODEL') or os.path.join(ROOT, 'models', 'ggml-base.bin')
TOKEN_FILE = os.path.join(ROOT, 'token')
HOST = os.environ.get('PARLZ_STT_HOST', '127.0.0.1')
PORT = int(os.environ.get('PARLZ_STT_PORT', '9111'))
MAX_BYTES = 24 * 1024 * 1024
FFMPEG_TIMEOUT = 60
WHISPER_TIMEOUT = 180
WHISPER_FLAGS = ['-nt', '-np', '-t', '2', '-mc', '0', '-et', '2.8', '--suppress-nst']
HALLUCINATION_HEADS = ('字幕', 'subtitle', 'amara.org', 'ming pao', '明報', '請不吝', '请不吝')
HALLUCINATION_TAILS = ('感謝您的觀看', '感谢您的观看', '谢谢观看', '點贊訂閱', '点赞订阅', '訂閱頻道', '订阅频道')
HALLUCINATION_WORDS = ('订阅', '訂閱', '点赞', '點贊', '转发', '轉發', '关注', '關注', '感谢', '感謝', '谢谢', '謝謝', '字幕', '观看', '觀看', '频道', '頻道', '打赏', '打賞')
LOCK = threading.Lock()


def clean_text(text):
    line = text.strip()
    if line == '':
        return ''
    low = line.lower()
    for head in HALLUCINATION_HEADS:
        if low.startswith(head):
            return ''
    if len(line) <= 20:
        for tail in HALLUCINATION_TAILS:
            if tail in line:
                return ''
        compact = re.sub(r'[\s,，。.、!！?？;；:：\-—…~]+', '', line)
        for word in HALLUCINATION_WORDS:
            compact = compact.replace(word, '')
        if compact == '':
            return ''
    return line


def read_token():
    try:
        with open(TOKEN_FILE, encoding='utf-8') as handle:
            return handle.read().strip()
    except OSError:
        return ''


def transcribe(raw, lang):
    work = tempfile.mkdtemp(prefix='parlz-stt-')
    try:
        source = os.path.join(work, 'in.bin')
        wav = os.path.join(work, 'in.wav')
        with open(source, 'wb') as handle:
            handle.write(raw)
        convert = subprocess.run(
            ['ffmpeg', '-nostdin', '-y', '-i', source, '-ac', '1', '-ar', '16000', '-f', 'wav', wav],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=FFMPEG_TIMEOUT)
        if convert.returncode != 0 or not os.path.exists(wav):
            raise RuntimeError('音频解码失败')
        with LOCK:
            run = subprocess.run(
                [BIN, '-m', MODEL, '-f', wav, '-l', lang] + WHISPER_FLAGS,
                capture_output=True, timeout=WHISPER_TIMEOUT, preexec_fn=lambda: os.nice(10))
        if run.returncode != 0:
            raise RuntimeError('识别失败')
        return clean_text(run.stdout.decode('utf-8', 'replace'))
    finally:
        shutil.rmtree(work, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'parlz-stt'

    def log_message(self, fmt, *args):
        return

    def reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/health':
            self.reply(200, {'ok': True, 'model': os.path.basename(MODEL), 'ready': os.path.exists(BIN)})
            return
        self.reply(404, {'ok': False, 'error': 'not found'})

    def do_POST(self):
        if self.path.split('?')[0] != '/transcribe':
            self.reply(404, {'ok': False, 'error': 'not found'})
            return
        expected = read_token()
        if expected != '' and self.headers.get('X-Parlz-Token', '') != expected:
            self.reply(403, {'ok': False, 'error': 'token'})
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0:
            self.reply(400, {'ok': False, 'error': 'empty body'})
            return
        if length > MAX_BYTES:
            self.reply(413, {'ok': False, 'error': 'too large'})
            return
        raw = self.rfile.read(length)
        lang = (self.headers.get('X-Parlz-Lang') or 'zh').strip() or 'zh'
        try:
            text = transcribe(raw, lang)
        except subprocess.TimeoutExpired:
            self.reply(504, {'ok': False, 'error': '识别超时'})
            return
        except RuntimeError as error:
            self.reply(500, {'ok': False, 'error': str(error)})
            return
        except Exception:
            self.reply(500, {'ok': False, 'error': '识别失败'})
            return
        self.reply(200, {'ok': True, 'text': text})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    server.serve_forever()


if __name__ == '__main__':
    main()
