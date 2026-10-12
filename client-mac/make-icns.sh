#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(uname -s)" != "Darwin" ]; then
    echo "iconutil 只在 macOS 上可用；在 Linux 上先跑 php gen_icons.php 生成 AppIcon.iconset，到 Mac 上再执行本脚本"
    exit 1
fi

if [ ! -d Resources/AppIcon.iconset ]; then
    echo "缺少 Resources/AppIcon.iconset，先执行：php gen_icons.php"
    exit 1
fi

iconutil -c icns Resources/AppIcon.iconset -o Resources/AppIcon.icns
echo "已生成 Resources/AppIcon.icns"
