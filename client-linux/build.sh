#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if command -v pkg-config >/dev/null 2>&1; then
    if ! pkg-config --exists webkit2gtk-4.1 && ! pkg-config --exists webkit2gtk-4.0; then
        echo "缺少 WebKitGTK 开发包，先装："
        echo "  Debian/Ubuntu : sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev"
        echo "                  （22.04 用 libwebkit2gtk-4.0-dev）"
        echo "  Fedora        : sudo dnf install gcc make pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel"
        echo "  Arch          : sudo pacman -S base-devel gtk3 webkit2gtk-4.1"
        echo "  Alpine        : sudo apk add build-base pkgconf gtk+3.0-dev webkit2gtk-4.1-dev"
        exit 1
    fi
else
    echo "缺少 pkg-config"
    exit 1
fi

if [ ! -f resources/icons/parlz-256.png ]; then
    if command -v php >/dev/null 2>&1; then
        php gen_icons.php
    else
        echo "缺少 resources/icons/parlz-256.png，且没有 php 可以生成（装 php 后跑 php gen_icons.php）"
        exit 1
    fi
fi

make clean >/dev/null
make
echo "已生成 dist/parlz"
