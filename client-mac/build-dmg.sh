#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

APP=dist/Parlz.app
DMG=dist/Parlz.dmg

if [ ! -d "$APP" ]; then
    echo "缺少 ${APP}，先执行 ./build.sh"
    exit 1
fi

rm -f "$DMG"

if [ "$(uname -s)" = "Darwin" ]; then
    STAGE=dist/dmg-stage
    rm -rf "$STAGE"
    mkdir -p "$STAGE"
    cp -R "$APP" "$STAGE/Parlz.app"
    ln -s /Applications "$STAGE/Applications"
    hdiutil create -volname Parlz -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
    rm -rf "$STAGE"
    echo "已生成 ${DMG}（拖入 Applications 即安装）"
    exit 0
fi

if command -v create-dmg >/dev/null 2>&1; then
    create-dmg --volname Parlz --app-drop-link 420 200 "$DMG" "$APP"
    echo "已生成 $DMG"
    exit 0
fi

if command -v dmg >/dev/null 2>&1; then
    dmg build "$DMG" "$APP"
    echo "已生成 $DMG"
    exit 0
fi

echo "在 Linux 上打 DMG 需要 libdmg-hfsplus（提供 dmg 命令）或 create-dmg："
echo "  git clone https://github.com/fanquake/libdmg-hfsplus && cd libdmg-hfsplus && cmake . && make"
echo "或者把 dist/Parlz.app 拷到 Mac 上执行本脚本（用 hdiutil，最稳）"
exit 1
