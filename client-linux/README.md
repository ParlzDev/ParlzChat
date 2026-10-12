# Parlz Linux 客户端（C + GTK3 + WebKitGTK）

Linux 桌面壳：原生窗口 + WebKitGTK 加载站点自己的页面，四个包格式都出。体积几十 KB（不打包浏览器内核，用系统自带的 WebKit）。

默认服务器 `https://chat.parlz.com`。

## 依赖

| 发行版 | 装依赖 |
|---|---|
| Debian / Ubuntu 24.04+ | `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev` |
| Ubuntu 22.04 | `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev` |
| Fedora | `sudo dnf install gcc make pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel` |
| Arch | `sudo pacman -S base-devel gtk3 webkit2gtk-4.1` |
| Alpine | `sudo apk add build-base pkgconf gtk+3.0-dev webkit2gtk-4.1-dev` |

## 编译

```bash
cd client-linux
./build.sh          # 产物 dist/parlz
./dist/parlz        # 直接跑
```

## 打包

```bash
./package-all.sh                  # 当前发行版能做哪些就打哪些
VERSION=1.0.0 ./packaging/deb/build-deb.sh        # 需要 dpkg-deb
VERSION=1.0.0 ./packaging/rpm/build-rpm.sh        # 需要 rpmbuild
VERSION=1.0.0 ./packaging/appimage/build-appimage.sh
VERSION=1.0.0 ./packaging/alpine/build-apk.sh     # 需要在 Alpine 上编译
```

产物都在 `dist/`：

| 格式 | 安装方式 |
|---|---|
| `.deb` | `sudo apt install ./parlz_1.0.0_amd64.deb` |
| `.rpm` | `sudo dnf install ./parlz-1.0.0-1.*.rpm` |
| `.AppImage` | `chmod +x` 后双击 |
| `.apk`（Alpine） | `sudo apk add --allow-untrusted ./parlz-1.0.0-r0.apk` |

AppImage 是「自带 AppRun 的薄壳」，**需要系统里有 `libwebkit2gtk-4.1`/`4.0`**（WebKit 不能塞进 AppImage，只能复用系统的）。

## 没有 Linux 机器也能出四个包（GitHub Actions）

`.github/workflows/build-linux.yml`：

- `ubuntu-22.04` → `.deb`（webkit2gtk-4.0）+ `.AppImage`
- `ubuntu-24.04` → `.deb`（webkit2gtk-4.1）
- `fedora:41` 容器 → `.rpm`
- `alpine:3.21` 容器 → `.apk`
- 打 `v*` tag 时自动挂到 Release

## 壳做了什么

- **WebKit 设置**：JS / DOM Storage / WebMediaStream / MediaSource / WebRTC 全开；`media_playback_requires_user_gesture = FALSE`（来电铃声与自动播放不用先点一下）
- **权限**：`permission-request` 里自动放行麦克风与相机（通话、扫码、拍照发送）
- **外部链接**：非本站链接交给系统默认浏览器（`gtk_show_uri_on_window`），本站链接留在窗口里
- **保存文件**：网页侧 `window.ParlzLinux` 桥分块传 base64 → 存到「下载」目录并弹窗提示路径；网页里直接以 http 链接触发的下载走 `WebKitDownload`
- **快捷键**：`F5` / `Ctrl+R` 重新加载、`Ctrl+K` 切换服务器（弹输入框，地址存 `~/.config/parlz/server`）、`F11` 全屏、`Esc` 退出全屏、`Ctrl+=` / `Ctrl+-` / `Ctrl+0` 缩放、`Ctrl+Q` 退出
- **命令行参数**：`parlz --server=https://your.host` 或直接给一个 URL 也能覆盖默认地址

## 网页侧的配套钩子

`assets/scripts/util.js` 与 `assets/scripts/app.js` 里对 `window.ParlzAndroid ?? window.ParlzIOS ?? window.ParlzLinux` 做了保护性判断（普通浏览器里完全不执行），所以 iOS / macOS / Android / Linux 四个壳共用同一份网页代码。

## 已知边界

- 应用关闭后收不到通知，窗口在前台时提示音正常
- 录屏（网页版截屏按钮）在 WebKitGTK 里不可用
- 通话走 WebRTC，直连不通时经服务器 coturn 中继（TCP）
- AppImage 不打包 WebKit，目标机器要装 `libwebkit2gtk-4.1` 或 `libwebkit2gtk-4.0`
