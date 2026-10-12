#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

VER=${VERSION:-1.0.0}
ARCH=${ARCH:-x86_64}
APPDIR=$PWD/build/Parlz.AppDir
TOOLS=$PWD/build/tools

mkdir -p "$TOOLS" dist
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"

cp dist/parlz "$APPDIR/usr/bin/parlz"
install -Dm644 resources/parlz.desktop "$APPDIR/usr/share/applications/parlz.desktop"
install -Dm644 resources/parlz.metainfo.xml "$APPDIR/usr/share/metainfo/com.parlz.chatter.metainfo.xml"
for f in resources/icons/parlz-*.png; do
    size=$(basename "$f" .png)
    size=${size#parlz-}
    install -Dm644 "$f" "$APPDIR/usr/share/icons/hicolor/${size}x${size}/apps/parlz.png"
done
cp resources/parlz.desktop "$APPDIR/parlz.desktop"
cp resources/icons/parlz-256.png "$APPDIR/parlz.png"

cat > "$APPDIR/AppRun" <<'RUN'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/parlz" "$@"
RUN
chmod +x "$APPDIR/AppRun"

if [ ! -x "$TOOLS/appimagetool" ]; then
    curl -fsSL -o "$TOOLS/appimagetool" \
        "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
    chmod +x "$TOOLS/appimagetool"
fi

export ARCH
"$TOOLS/appimagetool" --appimage-extract-and-run --no-appstream "$APPDIR" "dist/Parlz-${VER}-${ARCH}.AppImage"
ls -la dist/*.AppImage
