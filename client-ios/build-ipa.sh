#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${THEOS:-}" ]; then
    echo "未设置 THEOS 环境变量。先安装 Theos：https://github.com/theos/theos"
    exit 1
fi

if ! command -v ldid >/dev/null 2>&1; then
    echo "缺少 ldid（自签名工具），请先从 Theos 依赖或 Procursus 源安装"
    exit 1
fi

make clean >/dev/null 2>&1 || true
make

APP=$(find .theos -maxdepth 5 -name "Parlz.app" -type d | head -n 1)
if [ -z "$APP" ]; then
    echo "没找到构建产物 Parlz.app，请检查 THEOS 与 SDK 是否就绪"
    exit 1
fi

rm -rf Payload dist
mkdir -p Payload dist
cp -R "$APP" Payload/Parlz.app
rm -rf Payload/Parlz.app/_CodeSignature
ldid -SResources/Parlz.entitlements Payload/Parlz.app/Parlz
zip -qry dist/Parlz.ipa Payload
rm -rf Payload

echo "已生成 dist/Parlz.ipa"
