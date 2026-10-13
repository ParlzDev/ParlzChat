#!/bin/bash
set -e
SRC=${SRC:-/tmp/whisper-src}
PORT=${1:-/mnt/f/AI-Project/Parlz[Chatter]/deploy/stt/whisper-cli}
URL=${URL:-https://gh-proxy.com/https://github.com/ggerganov/whisper.cpp/archive/refs/heads/master.tar.gz}

rm -rf "$SRC"
mkdir -p "$SRC"
curl -sL -o /tmp/whisper.tar.gz "$URL"
for i in 1 2 3 4 5; do
  if gzip -t /tmp/whisper.tar.gz 2>/dev/null; then break; fi
  curl -sL -C - -o /tmp/whisper.tar.gz "$URL"
done
gzip -t /tmp/whisper.tar.gz
tar xzf /tmp/whisper.tar.gz -C "$SRC" --strip-components=1

cd "$SRC"
cmake -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=OFF \
  -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON \
  -DGGML_OPENMP=OFF \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_SERVER=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DCMAKE_EXE_LINKER_FLAGS='-static-libgcc -static-libstdc++'
cmake --build build -j"$(nproc)" --target whisper-cli

mkdir -p "$(dirname "$PORT")"
cp build/bin/whisper-cli "$PORT"
chmod +x "$PORT"
ls -l "$PORT"
file "$PORT"
