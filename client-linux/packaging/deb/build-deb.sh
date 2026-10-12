#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

VER=${VERSION:-1.0.0}
ARCH=${ARCH:-$(dpkg --print-architecture 2>/dev/null || echo amd64)}
ROOT="build/deb/parlz_${VER}_${ARCH}"

rm -rf "$ROOT"
mkdir -p "$ROOT/DEBIAN" dist

install -Dm755 dist/parlz "$ROOT/usr/bin/parlz"
install -Dm644 resources/parlz.desktop "$ROOT/usr/share/applications/parlz.desktop"
install -Dm644 resources/parlz.metainfo.xml "$ROOT/usr/share/metainfo/com.parlz.chatter.metainfo.xml"
for f in resources/icons/parlz-*.png; do
    size=$(basename "$f" .png)
    size=${size#parlz-}
    install -Dm644 "$f" "$ROOT/usr/share/icons/hicolor/${size}x${size}/apps/parlz.png"
done

WEBKIT_SO=$(objdump -p dist/parlz 2>/dev/null | awk '/NEEDED/ && /webkit2gtk/ {print $2}' | head -1)
case "$WEBKIT_SO" in
    libwebkit2gtk-4.0*) WEBKIT_DEP=libwebkit2gtk-4.0-37 ;;
    libwebkit2gtk-4.1*) WEBKIT_DEP=libwebkit2gtk-4.1-0 ;;
    *) WEBKIT_DEP="libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37" ;;
esac
echo "链接的 WebKit: ${WEBKIT_SO:-未知} -> 依赖 ${WEBKIT_DEP}"

cat > "$ROOT/DEBIAN/control" <<EOF
Package: parlz
Version: ${VER}
Section: net
Priority: optional
Architecture: ${ARCH}
Maintainer: Parlz <support@parlz.com>
Depends: libc6, libgtk-3-0, ${WEBKIT_DEP}
Homepage: https://chat.parlz.com
Description: Parlz chat client
 GTK + WebKitGTK shell for the Parlz chat service (https://chat.parlz.com).
EOF

dpkg-deb --build --root-owner-group "$ROOT" "dist/parlz_${VER}_${ARCH}.deb"
echo "已生成 dist/parlz_${VER}_${ARCH}.deb"
