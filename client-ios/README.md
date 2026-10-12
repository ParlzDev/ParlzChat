# Parlz iOS 客户端（Objective-C + WKWebView）

iOS 手机壳：全屏 WKWebView 加载站点自己的页面（三栏 QQ 风格、亮绿主题），Web 端更新的功能会自动出现。默认服务器 `https://chat.parlz.com`，支持**双指长按页面**换地址（弹出原生输入框，存在 NSUserDefaults）。

**说明：开发机是没有 Mac 也没有 iOS SDK 的 Linux 环境，所以这份工程没有在本地编译过**，工程结构与脚本按 Theos 的标准布局写好了，按下面步骤在 Linux 上即可出 IPA。

## 在 Linux 上打包 IPA

1. 装 **Theos**（官方仓库：<https://github.com/theos/theos>），并让它找到 iOS SDK
   - Theos 只提供工具链，**iOS SDK 需要从 Xcode 里导出**（`iPhoneOS*.sdk`），放到 `$THEOS/sdks/` 下；这一步只能在有 Xcode 的机器上做（Apple 的授权限制，没有公开镜像可绕）
   - 同时需要 `ldid`（自签名）与 `zip`
2. 打包：

```bash
cd client-ios
THEOS=~/theos ./build-ipa.sh
# 产物：client-ios/dist/Parlz.ipa
```

脚本做三件事：`make package FINALPACKAGE=1` 编译、把 `Parlz.app` 装进 `Payload/`、用 `ldid -SResources/Parlz.entitlements` 自签名后压成 `.ipa`。

3. 安装到手机（自签名 IPA 需要一次签名服务，任选其一）：
   - **AltStore / SideStore + 免费 Apple ID**：手机上安装后把 ipa 拖进去（免费账号签的有效期 7 天，到期重新签）
   - **TrollStore**（仅部分系统版本支持）：直接把 ipa 拖进去安装
   - **Sideloadly**（Windows/macOS 电脑上用 Apple ID 签名后安装）

## 没有 Mac 也能出 IPA（GitHub Actions）

仓库里带了现成的 workflow `.github/workflows/build-clients.yml`：**GitHub 的 macOS 运行器自带 Xcode（也就自带 iOS SDK）**，所以能在云端直接出包：

1. 把项目推到一个 GitHub 仓库
2. 打开仓库的 **Actions → build-clients → Run workflow**（或者打一个 `v1.0` 的 tag，会自动跑并把产物挂到 Release）
3. 跑完在 **Artifacts** 里下载 `Parlz-iOS`（里面是 `Parlz.ipa`）

workflow 里做了三件事：装 Theos 与 ldid、把 Xcode 的 `iPhoneOS*.sdk` 链进 `$THEOS/sdks/`、执行 `build-ipa.sh`。这是自签名（ad-hoc）IPA，装到手机上仍需一次签名服务（AltStore / Sideloadly / TrollStore）。

## 壳做了什么

- **WKWebView 设置**：JS / DOM Storage 打开；`allowsInlineMediaPlayback`（视频通话内联播放）；`mediaTypesRequiringUserActionForPlayback = None`（来电铃声与自动播放不需要先点一下）
- **权限**：启动时申请麦克风与相机（`Info.plist` 里带中文用途说明），语音消息、扫码、通话都要用
- **文件选择**：网页里的 `<input type=file>` 走系统选择器（iOS 14+ 原生支持）
- **外部链接**：非本站链接用系统浏览器 / 对应 App 打开；本站链接留在应用内
- **保存文件**：网页侧 `window.ParlzIOS` 桥（`beginSave / chunkSave / finishSave` 分块传 base64）——图片存到**相册**，其它文件存到**「文件 → Parlz」**（`UIFileSharingEnabled`）；网页里直接以 http 链接触发的下载走 WKDownload
- **切换服务器**：双指长按页面 → 原生输入框（也支持网页里任何走 `window.ParlzIOS.openServerDialog()` 的入口）

## 网页侧的配套钩子

`assets/scripts/util.js` 与 `assets/scripts/app.js` 里对 `window.ParlzAndroid ?? window.ParlzIOS` 做了保护性判断（普通浏览器里完全不执行），所以同一个网页可以同时服务 Android / iOS / macOS 三个壳。

## 已知边界

- 应用不在前台时收不到通知（WKWebView 没有 APNs 通道），前台提示音正常
- 录屏（网页版截屏按钮）在 WKWebView 里不可用；站点在手机宽度下本来就会隐藏该按钮
- iOS WKWebView 的摄像头/麦克风要求 **iOS 15+** 且应用在前台；通话走 WKWebView 的 WebRTC，直连不通时经服务器 coturn 中继
