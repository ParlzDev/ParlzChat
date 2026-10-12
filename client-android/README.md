# Parlz Android 客户端（Java + WebView）

手机版客户端：原生壳 + 全屏 WebView，加载站点自己的页面（三栏 QQ 风格、亮绿主题），所以 Web 端更新的功能会同步出现，不用重装 APK。

**已打包好可直接安装的 APK**：

- 站内下载（手机浏览器点开即下）：`https://chat.parlz.com/assets/uploads/parlz-android-1.0.apk`
- 仓库内文件：`client-android/dist/parlz-android-1.0.apk`（33 KB，release 签名版）

安装时系统会提示「允许安装未知来源应用」，同意即可；首次打开会申请相机与麦克风（语音消息、扫码、通话要用）。

## 构建

```bash
cd client-android
JAVA_HOME='D:\JavaJDK\jdk17' GRADLE_USER_HOME='D:\devtools\gradle-home' \
  /d/devtools/gradle/gradle-8.7/bin/gradle assembleRelease --no-daemon --console=plain
# 产物：app/build/outputs/apk/release/app-release.apk
```

- 需要 **JDK 17**（本机在 `D:\JavaJDK\jdk17`）与 Android SDK（本机离线布局在 `D:\devtools\sdk`，`local.properties` 里的 `sdk.dir` 指向它）
- 大陆网络下 Google 源不可达，`settings.gradle` 已把 **阿里云 maven 镜像**放在最前（gradle-plugin / google / public），Gradle 发行版用腾讯镜像下载
- SDK 组件的离线来源：官方清单 `https://dl.google.com/android/repository/repository2-3.xml`（本机可直连）取包名后下载，按 `platforms/android-34`、`build-tools/34.0.0`、`platform-tools`、`cmdline-tools/latest` 摆好目录即可
- **签名**：`keystore.properties`（已在 `.gitignore` 里）指向 `D:/devtools/parlz-release.jks`；正式发新版必须用同一密钥，否则手机上无法覆盖安装。没有 `keystore.properties` 时 release 不签名（只能装 debug 版）
- 图标是脚本生成的 PNG（`app/src/main/res/mipmap-*`），改图标后执行 `php gen_icons.php` 重新生成

## 壳做了什么

- **WebView 设置**：JS / DOM Storage / 数据库打开；`setMediaPlaybackRequiresUserGesture(false)`（来电铃声与自动播放不需要先点一下）；UA 追加 `ParlzAndroid/1.0`
- **权限**：启动时申请相机与麦克风；`onPermissionRequest` 只对当前服务器域放行
- **文件选择**：网页里的任何 `<input type=file>`（发图、发文件、改头像、传表情）走系统选择器，支持多选
- **外部链接**：非服务器域名的 http(s) 链接（以及 mailto/tel 等）交给系统浏览器 / 对应应用打开，站点内部链接留在应用里
- **返回键**：优先网页内后退，退无可退再退出应用
- **下载**：网页里保存图片 / 下载文件会被桥接成原文件名保存到系统「下载」目录（API 29+ 走 MediaStore；旧版本写公共下载目录）；网页里直接以 http 链接触发的下载走系统 DownloadManager
- **转屏 / 键盘**：`configChanges` 保证转屏不重建 WebView（通话与聊天状态不丢），输入法用 `adjustResize` 顶起输入框

## 服务器地址

默认 `https://chat.parlz.com`，存在 SharedPreferences 里。两种方式修改：

- **双指长按页面** 约 0.7 秒（网页侧检测到 `ParlzAndroid` 桥时才启用，不影响普通浏览器）
- 页面加载失败（例如服务器地址不可达）时自动弹出地址对话框

填 `http://192.168.x.x:端口` 也能用（清单里允许明文 HTTP，方便局域网直连开发机）。

## 网页侧的配套钩子

`assets/scripts/app.js` 与 `assets/scripts/util.js` 里有两处对 `window.ParlzAndroid` 的保护性判断：双指长按调 `openServerDialog()`；保存文件时走 `beginSave / chunkSave / finishSave` 分块桥（512KB 一块，避免把大文件塞进一个 JS 字符串）。普通浏览器里这些分支完全不会执行。

## 已知边界

- 桌面通知不可用（WebView 内通知没有原生通知栏通道），页面在前台时提示音正常
- 录屏（网页版截屏按钮）在 WebView 里不可用；站点在手机宽度下本来就会隐藏该按钮
- 语音 / 视频通话是 WebRTC 点对点，直连不通时走服务器上的 coturn 中继（TCP）
