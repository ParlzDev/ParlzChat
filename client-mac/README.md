# Parlz macOS 客户端（Objective-C + AppKit + WKWebView）

macOS 桌面壳：原生窗口 + WKWebView 加载站点自己的页面。体积只有几百 KB（不打包浏览器内核，用系统自带的 WebKit）。默认服务器 `https://chat.parlz.com`。

**说明：开发机是 Windows（没有 Xcode / macOS SDK），所以这份工程没有在本地编译过**；工程结构、构建脚本、图标生成脚本都备齐了，按下面步骤在 Mac 或在 Linux 交叉编译即可出 `.app`。

## 在 macOS 上构建（推荐，只需要 Xcode 命令行工具）

```bash
cd client-mac
php gen_icons.php        # 生成 AppIcon.iconset（任何系统都能跑）
./make-icns.sh           # macOS 上用 iconutil 转成 AppIcon.icns
./build.sh               # clang 编译 + 组装 Parlz.app + ad-hoc 签名 + 打包 zip
# 产物：dist/Parlz.app 与 dist/Parlz-mac.zip（双击即可运行）
```

只用到 `clang` 与 Cocoa/WebKit 框架，**装 Xcode Command Line Tools 就够**（不需要完整 Xcode）。

## 在 Linux 上交叉编译

需要 **osxcross + 从 Xcode 导出的 macOS SDK**（Apple 授权限制，没有公开镜像可绕）：

```bash
OSXCROSS=/path/to/osxcross ./build.sh
# 产物：dist/Parlz.app（未签名，拷到 Mac 上自行 codesign 或右键打开）
```

## 没有 Mac 也能出 .app / .dmg（GitHub Actions）

仓库里带了现成的 workflow `.github/workflows/build-clients.yml`，用 GitHub 的 macOS 运行器云端出包：

1. 把项目推到一个 GitHub 仓库
2. **Actions → build-clients → Run workflow**（或打 `v1.0` tag 自动跑并挂到 Release）
3. 在 **Artifacts → Parlz-macOS** 里下载 `Parlz.app`、`Parlz.dmg`、`Parlz-mac.zip`

DMG 用的是 macOS 自带的 `hdiutil`（脚本 `build-dmg.sh`，里面会放一个 Applications 快捷方式，拖进去即安装）。

## 分发注意

- 本工程用 **ad-hoc 签名**（`codesign --sign -`），本机运行没问题；要给别人用请用开发者证书签名并公证（notarize），否则对方首次打开会被 Gatekeeper 拦
- 从网络下载 zip 解压后若提示「已损坏」：`xattr -dr com.apple.quarantine dist/Parlz.app`，或右键 →「打开」

## 壳做了什么

- **WKWebView 设置**：JS / DOM Storage 打开；`mediaTypesRequiringUserActionForPlayback = None`（来电铃声与自动播放不需要先点一下）
- **权限**：启动时申请麦克风与相机，`Info.plist` 带中文用途说明；`Parlz.entitlements` 声明网络 / 相机 / 麦克风（macOS 12+ 的 WKWebView 支持 WebRTC 通话）
- **菜单**：`⌘K` 切换服务器（弹出输入框，地址存 NSUserDefaults）、`⌘R` 重新加载、`⌃⌘F` 全屏、`⌘Q` 退出
- **外部链接**：非本站链接用系统默认浏览器打开；本站链接留在窗口里
- **保存文件**：网页侧 `window.ParlzIOS` 桥分块传 base64 → 存到「下载」目录，弹窗可一键**在访达中显示**；网页里直接以 http 链接触发的下载走 WKDownload
- **命令行参数**：`--server=https://your.host` 或直接给一个 URL 也能覆盖默认地址

## 网页侧的配套钩子

`assets/scripts/util.js` 与 `assets/scripts/app.js` 里对 `window.ParlzAndroid ?? window.ParlzIOS` 做了保护性判断（普通浏览器里完全不执行），所以 iOS / macOS / Android 三个壳共用同一份网页代码。

## 已知边界

- 应用关闭后收不到通知（WKWebView 没有通知通道），窗口在前台时提示音正常
- 录屏（网页版截屏按钮）在 WKWebView 里不可用
- 通话走 WebRTC，直连不通时经服务器 coturn 中继（TCP）
