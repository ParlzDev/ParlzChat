#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

VER=${VERSION:-1.0.0}
export VERSION="$VER"

./build.sh

if command -v dpkg-deb >/dev/null 2>&1; then
    bash packaging/deb/build-deb.sh
else
    echo "跳过 deb：没有 dpkg-deb"
fi

if command -v rpmbuild >/dev/null 2>&1; then
    bash packaging/rpm/build-rpm.sh
else
    echo "跳过 rpm：没有 rpmbuild"
fi

if command -v curl >/dev/null 2>&1; then
    bash packaging/appimage/build-appimage.sh
else
    echo "跳过 AppImage：没有 curl"
fi

if command -v tar >/dev/null 2>&1 && [ -f /etc/alpine-release ]; then
    bash packaging/alpine/build-apk.sh
else
    echo "跳过 apk：不在 Alpine 上（apk 包请在 Alpine 里打）"
fi

echo
echo "产物："
ls -la dist/
