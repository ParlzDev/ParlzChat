#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

VER=${VERSION:-1.0.0}
ARCH=${ARCH:-x86_64}
ROOT=build/apk

rm -rf "$ROOT"
mkdir -p "$ROOT/usr/bin" "$ROOT/usr/share" dist

install -Dm755 dist/parlz "$ROOT/usr/bin/parlz"
install -Dm644 resources/parlz.desktop "$ROOT/usr/share/applications/parlz.desktop"
install -Dm644 resources/parlz.metainfo.xml "$ROOT/usr/share/metainfo/com.parlz.chatter.metainfo.xml"
for f in resources/icons/parlz-*.png; do
    size=$(basename "$f" .png)
    size=${size#parlz-}
    install -Dm644 "$f" "$ROOT/usr/share/icons/hicolor/${size}x${size}/apps/parlz.png"
done
install -Dm644 resources/parlz.png "$ROOT/usr/share/pixmaps/parlz.png"

SIZE=$(du -sb "$ROOT" | cut -f1)

WEBKIT_SO=$(objdump -p dist/parlz 2>/dev/null | awk '/NEEDED/ && /webkit2gtk/ {print $2}' | head -1)
case "$WEBKIT_SO" in
    libwebkit2gtk-4.0*) WEBKIT_DEP=webkit2gtk-4.0 ;;
    *) WEBKIT_DEP=webkit2gtk-4.1 ;;
esac
echo "链接的 WebKit: ${WEBKIT_SO:-未知} -> 依赖 ${WEBKIT_DEP}"

cat > "$ROOT/.PKGINFO" <<EOF
pkgname = parlz
pkgver = ${VER}-r0
pkgdesc = Parlz chat client
url = https://chat.parlz.com
builddate = $(date +%s)
packager = Parlz <support@parlz.com>
size = ${SIZE}
arch = ${ARCH}
origin = parlz
license = MIT
depend = gtk+3.0
depend = ${WEBKIT_DEP}
EOF

tar -czf "dist/parlz-${VER}-r0.apk" -C "$ROOT" .PKGINFO usr
ls -la "dist/parlz-${VER}-r0.apk"
echo "安装：apk add --allow-untrusted dist/parlz-${VER}-r0.apk"
