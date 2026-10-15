#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

OUT=dist/Parlz.app
FRAMEWORKS="-framework Cocoa -framework WebKit -framework AVFoundation -framework UserNotifications"

if [ "$(uname -s)" = "Darwin" ]; then
    CC=${CC:-clang}
else
    CC=""
    if [ -n "${OSXCROSS:-}" ]; then
        CC=$(ls "$OSXCROSS"/bin/*-apple-darwin*-clang 2>/dev/null | head -n 1 || true)
    fi
    if [ -z "$CC" ] || [ ! -x "$CC" ]; then
        echo "在 Linux 上交叉编译 macOS 应用需要 osxcross + 从 Xcode 导出的 macOS SDK"
        echo "（Apple 授权限制，没有公开镜像可绕）。装好后：OSXCROSS=/path/to/osxcross ./build.sh"
        echo "或者直接在 Mac 上运行 ./build.sh（只需要 Xcode 命令行工具）"
        exit 1
    fi
fi

rm -rf "$OUT" dist/Parlz-mac.zip
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"

"$CC" -fobjc-arc -O2 -mmacosx-version-min=12.0 $FRAMEWORKS \
    -o "$OUT/Contents/MacOS/Parlz" \
    Sources/main.m Sources/AppDelegate.m Sources/WebWindow.m Sources/NoticePanel.m

cp Resources/Info.plist "$OUT/Contents/Info.plist"
if [ -f Resources/AppIcon.icns ]; then
    cp Resources/AppIcon.icns "$OUT/Contents/Resources/AppIcon.icns"
fi

if [ "$(uname -s)" = "Darwin" ]; then
    codesign --force --deep --sign - --entitlements Resources/Parlz.entitlements "$OUT" >/dev/null 2>&1 \
        || echo "ad-hoc 签名没成功，可手动执行 codesign --force --deep --sign - dist/Parlz.app"
    (cd dist && zip -qry Parlz-mac.zip Parlz.app)
    echo "已生成 dist/Parlz.app 与 dist/Parlz-mac.zip（双击即可运行）"
else
    echo "已生成 dist/Parlz.app（交叉编译产物未签名，拷到 Mac 上后自行 codesign 或右键打开）"
fi
