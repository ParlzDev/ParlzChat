#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

cargo build --release

mkdir -p dist
rm -f dist/*.exe dist/*.dll dist/*.conf
cp target/release/parlz-client.exe dist/
cp target/release/parlz-cli.exe dist/
cp target/release/parlz_core.dll dist/
cp target/release/parlz-setup.exe dist/
printf 'server=%s\n' "${PARLZ_SERVER:-http://127.0.0.1:8137}" > dist/parlz.conf

echo
echo "打包完成 -> dist/"
ls -la dist
echo
echo "发给别人：拷整个 dist 目录，双击 parlz-setup.exe 安装"
