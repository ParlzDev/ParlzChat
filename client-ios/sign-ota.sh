#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

SIGN=dist/signing
SRC=${IPA:-dist/Parlz.ipa}
OUT=${OUT:-dist/Parlz-adhoc.ipa}
P12=${P12:-$SIGN/parlz.p12}
PROV=${PROV:-$SIGN/Parlz_AdHoc.mobileprovision}
BID=${BUNDLE_ID:-com.parlz.chatter}
PASS=${P12_PASSWORD:-}

if [ "$(uname -s)" = "Darwin" ]; then
    ZSIGN=${ZSIGN:-$SIGN/zsign-linux-musl}
else
    case "$(uname -s)" in
        Linux*) ZSIGN=${ZSIGN:-$SIGN/zsign-linux-musl} ;;
        *) ZSIGN=${ZSIGN:-$SIGN/zsign.exe} ;;
    esac
fi

for f in "$SRC" "$P12" "$PROV" "$ZSIGN"; do
    if [ ! -f "$f" ]; then
        echo "缺少文件：$f"
        exit 1
    fi
done

rm -f "$OUT"

if [ -n "$PASS" ]; then
    "$ZSIGN" -k "$P12" -p "$PASS" -m "$PROV" -b "$BID" -o "$OUT" "$SRC"
else
    "$ZSIGN" -k "$P12" -m "$PROV" -b "$BID" -o "$OUT" "$SRC"
fi

if [ ! -f "$OUT" ]; then
    echo "签名失败"
    exit 1
fi

SIZE=$(wc -c < "$OUT" | tr -d ' ')
echo "已签名：$OUT（$SIZE 字节）"
echo
echo "下一步："
echo "  1. 上传 $OUT 到服务器 /www/sites/chat.parlz.com/index/assets/uploads/parlz-ios-1.0.ipa"
echo "  2. 上传 deploy/ios-install/ios.php 到 docroot"
echo "  3. 手机 Safari 打开 https://chat.parlz.com/ios.php"
