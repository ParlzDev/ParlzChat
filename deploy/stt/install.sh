#!/bin/sh
set -e
ROOT=/opt/parlz-stt
BUILD=/tmp/whisper.cpp-master
MODEL=${1:-base}
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "$(id -u)" != "0" ]; then
  echo "请用 root 运行" >&2
  exit 1
fi

mkdir -p "$ROOT/models"

if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg
fi

if [ ! -x "$ROOT/whisper-cli" ]; then
  cp "$BUILD/build/bin/whisper-cli" "$ROOT/whisper-cli"
  cp "$BUILD"/build/bin/*.so* "$ROOT/" 2>/dev/null || true
fi

if [ ! -s "$ROOT/models/ggml-$MODEL.bin" ]; then
  curl -sL -o "$ROOT/models/ggml-$MODEL.bin.part" \
    "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
  mv "$ROOT/models/ggml-$MODEL.bin.part" "$ROOT/models/ggml-$MODEL.bin"
fi

if [ ! -s "$ROOT/token" ]; then
  head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$ROOT/token"
fi
chmod 600 "$ROOT/token"

cp "$HERE/whisper_http.py" "$ROOT/whisper_http.py"
cp "$HERE/parlz-stt.service" /etc/systemd/system/parlz-stt.service
systemctl daemon-reload
systemctl enable parlz-stt >/dev/null 2>&1 || true
systemctl restart parlz-stt
sleep 2
systemctl is-active parlz-stt
echo "token=$(cat "$ROOT/token")"
echo "model=$ROOT/models/ggml-$MODEL.bin"
