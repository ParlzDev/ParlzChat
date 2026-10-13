# 部署记录：chat.parlz.com（Linux + 1Panel/OpenResty + coturn）

服务器：`YOUR_SERVER_IP`（SSH 端口见你的面板），网站根目录 `/www/sites/chat.parlz.com/index`，PHP 8.5（容器 `PHP-85`，`127.0.0.1:9000`），OpenResty 容器 `1Panel-openresty-NklG`（host 网络，配置目录 `/www/conf.d/`）。

## 已经做完的（本次）

1. **代码上传**：站点文件 + 测试脚本 + `deploy/` 全部 scp 上去；排除了 `client/target`、`client-dotnet/bin|obj`、`turn/node_modules`。数据库用的是本地库里 `VACUUM INTO` 出来的干净快照（3 个账号 / 3 条动态 / 145 条消息 / 7 个会话），服务器已验证一致。
2. **Nginx 安全规则**（`/www/conf.d/chat.parlz.com.conf`，原文件已备份成 `chat.parlz.com.conf.bak-225201`）：
   - `data/`、`includes/`、`tests/`、`deploy/`、`turn/` 一律 404（之前 `/data/parlz.sqlite` 是**能被公网直接下载**的）
   - `config.php`、`router.php`、点文件、`.sqlite/.db/.bak/.log/.conf/.zip/.md/.json/.txt` 一律 404
   - `assets/` 只放行 css/js/svg/图片；上传目录里图片音视频内联、**其它类型强制 `Content-Disposition: attachment` + `nosniff`**；JS/CSS `no-store`、图片缓存一周
   - 加了 `client_max_body_size 80M` 与 `fastcgi_read_timeout 300`
   - `location = /` 内部跳到 `index.php`（首页 302 到 `?chat` 正常）
   - ⚠️ 1Panel 面板里若再点「保存」这个站点，可能会用面板模板覆盖这个文件——改完记得对比一下
3. **coturn 公网中继**（通话彻底修好的关键）：
   - `apt install coturn` + `/etc/turnserver.conf`（= `deploy/coturn.conf`，含 `external-ip=YOUR_SERVER_IP`、`listening-ip/relay-ip=YOUR_PRIVATE_IP`、中继端口段 50000-50100）
   - 这台 VPS 的网卡是私网 `YOUR_PRIVATE_IP`，公网 IP 走云 NAT，所以 `external-ip` 必须显式写，否则 relay 候选会发私网地址
   - `/etc/systemd/system/parlz-turn-firewall.service`：开机自动 `iptables` 放行 3478/udp、3478/tcp、50000-50100/udp（coturn 自己的单元带沙箱，不能用 ExecStartPost 调 iptables）
   - 站点 `turn/config.json` 里 `public_host=chat.parlz.com`，前端已自动下发（`PARLZ_BOOT.turn`）
4. **实测**（从外网）：
   - `turn:chat.parlz.com:3478?transport=tcp` → 拿到 `relay YOUR_SERVER_IP` 候选；两端强制只走中继的数据通道**成功传数据**
   - 敏感路径全部 404、站点 `?login` 200、上传图片 200 + `nosniff`、`/` 302
   - PHP 扩展齐全（gd 带 webp / pdo_sqlite / curl / mbstring），上传上限 100M

## 传输方式：只走 TCP（不上 UDP）

按你的要求（UDP 容易被 DDoS），通话中继**只开 TCP**：

- coturn 加 `no-udp`：不监听任何 UDP 端口（`ss -lunp | grep 3478` 为空）
- 主机防火墙只放行 `3478/tcp`；云安全组也只留 TCP（不用放行任何 UDP）
- 站点下发的 ICE 配置就只有 `turn:chat.parlz.com:3478?transport=tcp` + 两个国内 STUN（`turn/config.json` 里 `"transport": "tcp"`）
- 两端都走这台中继时，媒体在服务器内部两个分配之间转发（客户端↔服务器是 TCP），**不需要放行中继端口段**；中继端口段只影响「一端走中继、另一端直连」的混合场景
- 实测（应用自己的配置、两端强制 relay）：`relay YOUR_SERVER_IP` 候选 + 数据通道成功传输

想再快一点可选（都不必做）：给 coturn 加 TLS 监听（用站点那张证书）放到 5349/tcp，客户端用 `turns:`；或者在安全组放行 UDP 3478（体验更好但就是你说的 DDoS 面）。

## 还可以顺手做的

- 把 `/www/sites/chat.parlz.com/index/client-dotnet.zip`（383MB）和 docroot 里的 `client/`、`client-dotnet/`、`client-android/`、`start.bat` 删掉——现在它们已经不可访问，只是占空间（docroot 总占用 1.5G）

## Android APK

已打包并放在站上供手机下载：`https://chat.parlz.com/assets/uploads/parlz-android-1.0.apk`（33 KB，release 签名；仓库里 `client-android/dist/` 也有一份）。重新打包的命令见 `client-android/README.md`（签名密钥在 `D:/devtools/parlz-release.jks`，换密钥会导致无法覆盖安装）。

## 客户端地址

`client-android` 与 `client-dotnet` 的默认服务器已改为 `https://chat.parlz.com`；手机端现在直接用 `https://chat.parlz.com` 访问即可（Android APK 需重新编译才会带新默认值，或双指长按改地址）。

## 本机（Windows）开发环境

- 本地 `turn/config.json` 也改成指向 `chat.parlz.com:3478`，所以本机 frp 站点打来的电话现在也走公网中继（通话不再依赖内网可达性）；本机那套 `turn/server.js` + 樱花隧道自动识别只在你想用局域网中继时才需要启动
- 不要再让两台机器同时写同一个 SQLite：需要同步就把本机 `VACUUM INTO` 的快照覆盖到服务器 `data/parlz.sqlite`

## 静态资源缓存（改完没生效的第一嫌疑）

线上 vhost 的真身在服务器 `/www/conf.d/chat.parlz.com.conf`，仓库里同步了一份 `deploy/openresty-chat.parlz.com.conf`。1Panel 默认给 `js|css|png|…` 一整条正则 `expires 300d`，而 `chat.parlz.com.security` 里那条 `no-store` 的 assets 规则排在它后面 —— nginx 的正则 location 只取第一个命中的，所以那条一直没生效：`index.php` 只给顶层 `<link>`/`app.js` 加了 `?v=mtime`，`app.js` 里 `import './util.js'` 这种**不带 query 的相对导入**会被客户端按 300 天缓存，于是"服务器文件已经换了、手机端还在跑旧模块"。

现在 js/css 单独一条 `expires -1`（即 `Cache-Control: no-cache`，靠 ETag 走 304），图片/字体仍 300d。改完 vhost 必须 `docker exec 1Panel-openresty-kHxh nginx -t` 通过再 `nginx -s reload`；1Panel 在控制台改站点设置会重写这个文件，改坏了用同目录 `chat.parlz.com.conf.bak-cachefix` 回滚。

已经在 300 天缓存里躺着旧 `util.js`/`messages.js` 的客户端不会自动回来取新文件，需要清一次缓存：Android 壳 = 系统设置→应用→Parlz→存储→清除缓存；Windows 壳 = 删 `%LOCALAPPDATA%\Parlz\WebView2\Default\Cache`；iPhone Safari = 设置→Safari→清除历史记录与网站数据；桌面浏览器 Ctrl+F5。
