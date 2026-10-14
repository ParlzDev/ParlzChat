# Parlz

亮绿主题的聊天网站，PHP + 原生 JS + CSS，WeChat 风格三栏布局。默认淡色系，可在设置里切换暗色系；全部颜色为纯色（无渐变、无阴影、无半透明）。

## 功能

- 账号：注册、登录、退出，密码 bcrypt 存储
- 聊天：私聊会话、群聊、消息历史翻页、Enter 发送、正在输入提示，每条消息的时间常显在气泡外侧（淡色等宽字体，不占气泡空间）
- 链接：消息里的网址自动变成可点链接，并解析 Open Graph 生成卡片（标题 / 描述 / 封面图 / 站点），结果在服务端缓存（成功 7 天、失败 1 小时），抓取有超时、体积上限与内网地址拦截
- @ 提及：群聊里输入 `@` 或点输入框旁 ＠ 按钮弹出成员选择（支持 ↑↓ / Enter），消息里会高亮显示，被提及的是你会额外强调
- 表情：24 个手绘 SVG 表情（`assets/scripts/stickers.js`），不依赖 emoji 字体，点一下插入输入框，可与文字混排，服务端白名单校验
- 图片：发图支持选择文件、直接粘贴（Ctrl+V）和**截屏**（浏览器屏幕捕获，抓一帧后整屏铺开，像 QQ 一样拖框选区域——选区外压黑、选区内显示画面，右下角实时显示源像素尺寸，Enter 发送 / Esc 取消，不拖选就是整张）；上传后一律转成 WebP（最长边 1280、上限 8MB、EXIF 方向自动纠正），点图弹窗查看（带「新窗口打开」与关闭按钮）
- 右键菜单：消息上右键可复制文本 / **复制图片**（WebP 转 PNG 后写进系统剪贴板，可直接粘到别的应用）/ **保存图片**（直接下载，不会打开新窗口）/ 打开或复制图片链接 / @TA / 查看资料 / **转发** / **多选** / 撤回（仅自己的消息，撤回会同步给其他在线成员）
- 转发：多选后底部工具条点「转发」，在抽屉里选**合并转发**（默认，生成一条可展开的聊天记录卡片，最多 30 条，文本/表情/图片都能带）或**单独转发**（逐条发送），再选目标会话即可；聊天记录卡片**在新窗口打开**（`window.open` 独立窗口，可拖到屏幕任何位置、可缩放），里面的嵌套卡片再点还会开新一层窗口（`assets/scripts/record.js`，在浏览器和 WebView2 客户端里都是真窗口）；图片始终只引用原文件，不重复上传
- 群组：创建群聊、邀请好友、改群名、**换群头像**（群主，默认群任意成员）、退群，默认群 `Parlz 广场` 全员自动加入
- 通讯录：好友搜索、好友申请 / 接受 / 拒绝 / 撤回、删除好友、在线状态
- 资料：昵称、个性签名、头像上传（自动裁方转 WebP）、修改密码，都在设置页；点击任意对方头像进入其资料页（含关系状态与操作）
- 设置：独立页面 `?setting`，主题切换（淡色 / 暗色，localStorage 记忆）、我的资料编辑、账号信息、修改密码、登录设备管理、回车发送开关、收藏夹入口、退出登录
- 实时：1.6 秒轮询驱动的新消息、未读计数、在线与输入状态；被 @ 的会话在列表里显示红色「有人@我」角标
- 我的表情包：表情面板分「我的表情 / 默认表情」两段，自己上传的图片/GIF 收藏进「我的表情」（最多 50 个，点一下直接发，GIF 保留动画）
- 消息收藏夹：长按/右键消息可收藏文字、图片、文件、语音，设置页「收藏夹」集中查看（图片缩略图、文件可再下载、可删除）
- 群文件：群信息抽屉里聚合展示群里发过的所有文件（名字、发送人、大小、日期、下载）
- 动态广场：独立页面 `?moments`，发文字 + 最多 9 张图，点赞（显示赞过的人）、评论、删除自己的动态，图片点开大图
- 语音 / 视频通话：私聊头像栏的 📞 / 🎥 按钮发起，WebRTC（信令走服务端轮询；ICE 用本机 TURN + 公共 STUN/TURN，见 `turn/`），来电浮层（接听 / 拒绝）、连接中 / 计时 / 媒体断开 状态、静音、开关摄像头、挂断；**没有摄像头的设备自动降级成语音通话**（不会拒接）；对方 60 秒不接自动标记未接；「设置 → 通话网络自检」可以看本机拿到了哪些通路（host / srflx / relay）
- 拍一拍：双击对方（或自己）头像，聊天里出现「XX 拍了拍 YY」（3 秒冷却）
- 文件传输助手：会话列表里固定一个自己发自己的「文件传输助手」，手机与电脑之间互传文件图片

## 页面路由

界面按 URL 分离，服务端识别路由、客户端 `pushState` 同步地址栏，浏览器前进/后退可用：

| 地址 | 内容 |
| --- | --- |
| `/` 或 `index.php`（无参数） | 302 跳转到 `index.php?chat` |
| `index.php?chat` | 聊天（默认页，未登录会跳到 `?login`）；`?chat&uid=A00001` 直达某个群、`?chat&uid=U00004` 直达与某人的私聊 |
| `index.php?contact` | 通讯录（好友、群聊、好友申请），搜索框支持用户名 / 昵称 / UID |
| `index.php?moments` | 动态广场：发布、点赞、评论 |
| `index.php?setting` | 设置页：我的资料（头像/昵称/签名/统计）、外观主题、账号、密码、退出登录 |
| `index.php?profile&id=N` | 用户资料页；不传 `id` 看自己，点任意对方头像即进入该页 |
| `index.php?login` / `index.php?register` | 登录 / 注册；已登录访问会跳回 `?chat` |

## 运行

两个进程：网站本体 + 通话中继（TURN）。Windows 上直接双击根目录的 `start.bat` 会各开一个窗口跑起来；手动启动则是：

```bash
php -d upload_max_filesize=72M -d post_max_size=80M -S 127.0.0.1:8137 router.php
cd turn && npm install && node server.js
```

打开 http://127.0.0.1:8137 ，注册两个账号即可互相加好友聊天。TURN 只在通话需要中继时被用到，不跑它其它功能不受影响（但跨网段通话会变成打不通）。细节见 `turn/README.md`。

注意：PHP 默认只允许传 2MB 文件（`upload_max_filesize`），本站支持最大 64MB 的文件，请按上面的 `-d` 参数启动，或在 php.ini 里把 `upload_max_filesize` / `post_max_size` 调大（都要大于 64MB）。

Apache / Nginx 部署时把站点根指向本目录，`data/`、`includes/`、`config.php`、`tests/` 需要禁止直接访问（`router.php` 已内置拦截，Apache 另见 `data/.htaccess`）。

开发服务器下 `router.php` 会给 `assets/` 的 JS/CSS 加 `Cache-Control: no-store`（改完普通刷新即可生效），图片和上传文件则允许缓存一周（文件名带随机哈希，不会发旧图）；上线后由你的 Web 服务器自己配缓存策略。上传的非图片文件一律以 `Content-Disposition: attachment` 下载，不会在浏览器里直接执行。

## 测试与清空数据

```bash
php tests/smoke.php
php tests/reset.php
```

`smoke.php` 有 84 条判据，覆盖注册登录、好友申请与接受、私聊与群聊、未读与已读、表情白名单、图片上传与非法引用拒绝、消息撤回权限、合并转发（含内容规范化与非法项降级）、群头像权限、头像上传与伪装文件拒绝、权限（非群主改名、非成员访问）、路径穿越与数据文件拦截、URL 路由（含 `/` 跳 `?chat`）、OG 解析与内网地址拦截，需要服务已在 8137 端口运行。`call_check.php` 与 `moments_check.php` 分别对通话信令（呼叫 / 接听 / ICE / 拒接 / 取消 / 超时未接 / 忙碌冲突 / 越权）与动态（发布 / 点赞 / 评论 / 删除 / 校验）做接口级断言，跑完自动清理测试账号。

`reset.php` 一键清空所有用户、消息、自建群聊、头像与聊天图片、链接卡片缓存，只保留默认群 `Parlz 广场`。

## 目录结构

```
index.php              应用外壳（登录页 + 三栏界面）
router.php             开发服务器路由，拦截 data/ includes/ tests/ config.php
config.php             常量配置（上限、在线窗口、表情白名单等）
includes/              bootstrap / sqlite / JSON 工具 / 查询函数 / 链接抓取
api/                   auth, users, profile, friends, groups, chats, messages, poll, link, uploads, stickers, favorites, moments, call
assets/style/          base.css, auth.css, layout.css, components.css, record.css
assets/scripts/        app.js 及 api / state / util / icons / stickers / theme / richtext / record 与各视图模块（moments / call / scan / poller 等）
assets/img/            logo.svg, favicon.svg
assets/avatars/        用户与群聊头像（需可写）
assets/uploads/        聊天图片与文件（需可写）
data/                  SQLite 数据库（需可写，首次运行自动建表）
turn/                  通话中继 TURN（node-turn，网站自动读取 turn/config.json）
start.bat              一键启动网站 + TURN 两个进程（Windows）
client-android/        Android 手机客户端（Java + WebView，Gradle 工程，含预编译 APK）
client-ios/            iOS 手机客户端（Objective-C + WKWebView，Theos 工程，Linux 可打 IPA）
client-mac/            macOS 桌面客户端（Objective-C + AppKit + WKWebView，含构建脚本）
client-dotnet/         .NET 单文件桌面客户端（WinForms + WebView2）
client/                早期 Rust 实现（DLL 核心 / CLI / 安装器，留档）
tests/smoke.php        端到端判据脚本
tests/call_check.php   通话接口判据脚本
tests/moments_check.php 动态接口判据脚本
tests/cleanup_test_accounts.php 按 id 清理测试账号与产物
tests/reset.php        清空用户数据脚本
```

## 图片与截屏

发图三条路径都走同一个上传接口（`api/uploads.php`）：文件选择、剪贴板粘贴、屏幕捕获。服务端用 GD 重新编码成 WebP（不保留原始文件与元数据），并把 EXIF 方向摆正，因此手机拍的竖图不会躺倒。

截屏用的是浏览器 `getDisplayMedia`，必须在**安全上下文**（HTTPS 或 localhost）里用，否则按钮会提示改用 HTTPS——如果站点是纯 HTTP 域名部署的，截屏会不可用（其它功能不受影响）。截屏进入后是整屏铺开的选区模式（没有弹窗和提示文字）：画面按比例适配视口居中，拖动框选后选区外压成纯黑实色、选区内保持原画面，右下角浮动条实时显示选区的源像素尺寸并提供取消 / 发送。遮罩全部用实色绘制，符合全站「只用纯色」的规则。

「复制图片」同样依赖 Clipboard API 与安全上下文：本地开发用 127.0.0.1 没问题，纯 HTTP 域名下会提示不可用（可用「复制图片链接」代替）。

## 链接卡片抓取

服务端抓取网页元数据（og:title / og:description / og:image / og:site_name，缺省回退 `<title>`），并转换为 UTF-8（GBK 等中文编码自动识别）。安全与限额：仅 http/https、拒绝内网与保留地址（含重定向后的最终地址）、连接 4 秒 / 总 7 秒超时、最多读 256KB、跟随 3 次跳转。

HTTPS 校验需要 CA 包：会依次找 `PARLZ_CA_FILE`、Git for Windows 自带的 `ca-bundle.crt`、`/etc/ssl/certs/ca-certificates.crt` 等；一个都找不到时会退回不校验证书（不推荐，生产环境建议在 `config.php` 里指定 `PARLZ_CA_FILE` 或给 PHP 配 `curl.cainfo`）。

## 桌面客户端（.NET 单文件）

`client-dotnet/` 是一个 .NET 10 + WinForms + WebView2 的桌面客户端：界面直接用站点自带的页面（就是上面那套三栏 QQ 风格），**发布成单个 exe，不需要安装器、不需要额外 DLL/资源**。

```bash
cd client-dotnet
dotnet publish -c Release -o dist
# 产物：dist/Parlz.exe（自包含 win-x64 单文件，约 50MB，拷走双击即用）
# 若客户端正在运行会锁定 exe，可加 --artifacts-path 换构建目录：
#   dotnet publish -c Release -o dist --artifacts-path /d/devtools/dotnet-artifacts
```

- 窗口标题只显示 **Parlz**，默认连 `https://chat.parlz.com`；按 **F2** 弹出「切换服务器」对话框（显示当前地址，改完写入 exe 同目录的 `parlz.conf` 并刷新），也可以用 `--server=http://host:port` 启动参数覆盖
- 依赖系统 WebView2 运行时（Win10/11 自带）；`F5` 刷新页面
- 最新构建产物：`client-dotnet/dist/Parlz.exe`（自包含单文件，约 50MB）；换地址不需要重新编译，F2 即可
- 数据目录固定在 `%LOCALAPPDATA%\Parlz\WebView2`，程序目录保持干净（单文件可以直接放 U 盘/桌面运行）
- 合并转发与嵌套聊天记录会开在**独立窗口**里：可以用鼠标拖到屏幕任何位置、自由缩放，嵌套记录再点还会开新的一层窗口（由 `NewWindowRequested` 处理）

## Android 手机客户端（Java + WebView）

`client-android/` 是一个 Java 写的 Android 壳：全屏 WebView 加载站点自己的页面，所以手机端和网页端功能一致、更新即生效。默认服务器 `https://frp-fan.com:60877`（双指长按页面可改，存 SharedPreferences；连不上时也会自动弹地址对话框）。

```bash
cd client-android
./gradlew assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

**预编译 APK（release 签名，35 KB）**：`https://chat.parlz.com/assets/uploads/parlz-android-1.0.5.apk`，仓库里也有 `client-android/dist/parlz-android-1.0.5.apk`；手机打开链接下载安装即可（需允许「安装未知来源应用」）。

自己构建需要 JDK 17 + Android SDK（`client-android/README.md` 里有大陆网络下的离线 SDK 与镜像配方），用 Android Studio 打开 `client-android/` 直接 Run 也可以。壳的本事：文件选择（发图 / 发文件 / 头像 / 表情）、相机与麦克风权限（扫码、语音消息、通话）、外部链接交给系统浏览器、返回键网页内后退、下载走分块桥保存到系统下载目录（保留原文件名）。细节与已知边界（WebView 内没有原生通知、无 TURN 的通话限制）见 `client-android/README.md`。

## 客户端一览与云打包

| 客户端 | 目录 | 产物 | 怎么出产物 |
| --- | --- | --- | --- |
| Android | `client-android/` | `app-release.apk`（已挂在站上可下载） | 本机 `gradle assembleRelease`，或 Android Studio |
| Windows | `client-dotnet/` | 单文件 `Parlz.exe` | 本机 `dotnet publish -c Release -o dist` |
| iOS | `client-ios/` | `Parlz.ipa` | Linux/Mac 装 Theos+iOS SDK 后 `./build-ipa.sh`；或云端 workflow |
| macOS | `client-mac/` | `Parlz.app` / `Parlz.dmg` | Mac 上 `./build.sh && ./build-dmg.sh`；或云端 workflow |

**Apple 平台的 SDK 只能从 Xcode 获得**（iOS SDK / macOS SDK，没有公开镜像），所以 iOS 与 macOS 包推荐用仓库里自带的 **`.github/workflows/build-clients.yml`**：推到 GitHub 后手动 Run（或打 `v1.0` tag），云端 macOS 运行器会编译并上传 `Parlz.ipa` / `Parlz.app` / `Parlz.dmg`，tag 触发时还会自动挂到 Release。

## 早期 Rust 版本（留档）

`client/` 是之前的 Rust 实现，包含 DLL 核心 `parlz-core`（std-only HTTP + 全部接口，导出 `parlz_*` C ABI）、控制台客户端 `parlz-cli`、以及安装器 `parlz-setup`（整目录安装 + 快捷方式 + Win32 注册表卸载项 + 自清理）。新客户端已不再依赖它们，仅作参考保留。

## 主题说明

两套配色都只由纯色组成，深浅层次一律用实色与 1px 描边表达：

- 淡色（默认）：页底淡绿 `#eefcf4`，面板纯白 `#ffffff`，主绿 `#00d95f`，正文墨绿 `#0b2415`
- 暗色：页底深绿灰 `#101a15`，面板 `#16241c`，主绿 `#23ff7d`（不是纯黑，避免高对比刺眼）

全部色值集中在 `assets/style/base.css` 的 `:root[data-theme]` 两个块里，改色只改这两块。头像方块的四种底色为 `.avatar[data-skin]`，按用户 ID 取模分配。

绿色气泡（自己发的消息、合并记录里自己的条目）里的内容一律用深色前景 `--on-green`：正文、`@` 提及、链接、自绘表情都跟着切换；表情里原本用亮绿填充的图形（爱心/星星/火箭/月亮/火/蛋糕烛火）走 `--sticker-fill` 变量，在绿底上下文里自动变成深色，避免「绿上绿」看不见。
