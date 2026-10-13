<?php

declare(strict_types=1);

const PARLZ_STT_MAX_BYTES = 25165824;

function stt_ready(): bool
{
    return PARLZ_STT_API_KEY !== '' || PARLZ_STT_URL !== '';
}

function stt_api_ready(): bool
{
    return PARLZ_STT_API_KEY !== '' && PARLZ_STT_API_BASE !== '';
}

function stt_provider(): string
{
    $provider = strtolower(PARLZ_STT_PROVIDER);
    return in_array($provider, ['groq', 'siliconflow', 'openai'], true) ? $provider : 'openai';
}

function stt_api_transcribe(string $bytes, string $name, string $lang): string
{
    $boundary = '----parlz' . bin2hex(random_bytes(8));
    $mime = 'audio/webm';
    if (preg_match('/\.(mp3|m4a|mp4|wav|ogg|webm|aac)$/i', $name, $m) === 1) {
        $ext = strtolower($m[1]);
        $mime = $ext === 'wav' ? 'audio/wav' : ($ext === 'mp4' ? 'audio/mp4' : ($ext === 'ogg' ? 'audio/ogg' : ($ext === 'aac' ? 'audio/aac' : ($ext === 'mp3' ? 'audio/mpeg' : 'audio/webm'))));
    }
    $fields = ['response_format' => 'json', 'language' => $lang];
    if (stt_provider() === 'siliconflow') {
        $fields['model'] = PARLZ_STT_MODEL !== '' ? PARLZ_STT_MODEL : 'FunAudioLLM/SenseVoiceSmall';
    } else {
        $fields['model'] = PARLZ_STT_MODEL !== '' ? PARLZ_STT_MODEL : 'whisper-large-v3-turbo';
        $fields['temperature'] = '0';
        $fields['prompt'] = '以下是普通话的句子。';
    }
    $body = '';
    foreach ($fields as $key => $value) {
        $body .= '--' . $boundary . "
";
        $body .= 'Content-Disposition: form-data; name="' . $key . '"' . "

" . $value . "
";
    }
    $body .= '--' . $boundary . "
";
    $body .= 'Content-Disposition: form-data; name="file"; filename="' . $name . '"' . "
";
    $body .= 'Content-Type: ' . $mime . "

" . $bytes . "
";
    $body .= '--' . $boundary . '--' . "
";

    $ch = curl_init(rtrim(PARLZ_STT_API_BASE, '/') . '/audio/transcriptions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . PARLZ_STT_API_KEY,
            'Content-Type: multipart/form-data; boundary=' . $boundary,
            'Content-Length: ' . strlen($body),
        ],
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = (string)curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        fail('语音识别接口连不上' . ($error !== '' ? '：' . $error : ''), 503);
    }
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) {
        fail('语音识别返回了看不懂的内容', 502);
    }
    if ($code >= 400) {
        $message = (string)($data['error']['message'] ?? $data['message'] ?? '语音识别失败');
        error_log('parlz stt api failed: ' . $message);
        fail('语音识别失败：' . mb_substr($message, 0, 80), $code);
    }
    $text = (string)($data['text'] ?? '');
    return trim($text);
}

function stt_voice_file(string $body): ?string
{
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return null;
    }
    $name = (string)($decoded['file'] ?? '');
    if (preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name) !== 1) {
        return null;
    }
    $path = PARLZ_UPLOAD_DIR . '/' . $name;
    if (!is_file($path)) {
        return null;
    }
    return $path;
}

function stt_transcribe(string $bytes, string $lang = 'zh', string $name = 'voice.webm'): string
{
    if (!stt_ready()) {
        fail('服务器还没配置语音转文字', 503);
    }
    if (stt_api_ready()) {
        return stt_api_transcribe($bytes, $name, $lang);
    }
    $ch = curl_init(PARLZ_STT_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $bytes,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream',
            'Content-Length: ' . strlen($bytes),
            'X-Parlz-Token: ' . PARLZ_STT_TOKEN,
            'X-Parlz-Lang: ' . $lang,
        ],
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = (string)curl_error($ch);
    curl_close($ch);
    if ($body === false) {
        fail('语音识别服务连不上' . ($error !== '' ? '：' . $error : ''), 503);
    }
    $data = json_decode((string)$body, true);
    if (!is_array($data) || ($data['ok'] ?? null) !== true) {
        $message = is_array($data) ? (string)($data['error'] ?? '语音识别失败') : '语音识别失败';
        fail($message, $code >= 400 && $code < 600 ? $code : 500);
    }
    return trim((string)($data['text'] ?? ''));
}

function stt_cache_get(int $messageId): ?string
{
    $stmt = db()->prepare('SELECT text FROM stt_texts WHERE key = ?');
    $stmt->execute(['m' . $messageId]);
    $row = $stmt->fetchColumn();
    return $row === false ? null : (string)$row;
}

function stt_cache_set(int $messageId, string $text): void
{
    db_write(static function () use ($messageId, $text): void {
        db()->prepare('INSERT INTO stt_texts (key, text, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET text = excluded.text')
            ->execute(['m' . $messageId, $text, time()]);
    });
}
