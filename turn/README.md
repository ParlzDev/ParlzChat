# Parlz TURN（通话中继）

两台设备直连打不通时（跨网段、NAT 不支持回环、运营商 CGNAT、IPv6 被路由器墙），WebRTC 需要一台中继服务器转发媒体。这里就是给 Parlz 通话兜底的中继：本机同时监听 **UDP 3478（TURN 本体）** 和 **TCP 3478（给 frp TCP 隧道用的桥）**。

## 启动

```bash
cd turn
npm install
node server.js
```

或双击 `start.bat`（首次自动装依赖）。启动后在 `turn/config.json` 写入账号密码，网站会自动读取，不用改代码：

```json
{
  "user": "parlz",
  "pass": "自动生成的密码",
  "port": 3478,
  "public_host": "",
  "public_port": 0,
  "public_source": "",
  "relay_ips": ["192.168.1.230"]
}
```

## 局域网（默认，零配置）

没配公网入口时，网站把**本机局域网 IP** 当 TURN 地址发下去。同一个家里、能访问到这台机器的设备，打不通直连时走本机中继就能通。

## 外网（手机用流量、跨网络）

要跨网络，得把 3478 暴露到公网。用你已有的樱花 frp：

1. 樱花 frp 面板 → 新建隧道
2. **名称填 `parlz-turn`**（必须叫这个，下面的自动识别靠它）
3. 类型选 **TCP**（推荐，走桥；如果面板给 UDP 也可以，UDP 就是 TURN 本体直连）
4. 本地地址 `127.0.0.1`，本地端口 `3478`，远程端口挑一个空闲的（例如 60878）
5. 保存启动

**不用再改任何配置**：`server.js` 每 30 秒扫一次樱花日志，认出 `parlz-turn` 隧道后自动把公网域名与端口写进 `turn/config.json`（`public_source: "log"`），网站下次加载就会带上它。手工填 `public_host` / `public_port` 也支持（此时把 `public_source` 设为 `"manual"`，自动识别就不再覆盖）。

## 自检

网站「设置 → 通话网络自检」列出本机拿到的候选：`host` 局域网直连、`srflx` 公网映射、`relay` 服务器中继。两台设备各测一次，**relay 有值**就说明中继链路可用，列表里的地址就是实际通路。

命令行快速验证（本机）：

```bash
node -e "console.log('udp/tcp 3478')" && netstat -ano | findstr :3478
```

## 说明

- 中继只转发不存储；能直连时 WebRTC 自己会选直连，中继只是兜底
- 走中继延迟略高（数据绕一圈），语音基本无感；樱花隧道的 24 Mibit/s 限速对语音/视频够用
- 用的是 [node-turn](https://github.com/Atlantis-Software/node-turn)（MIT），它只认 UDP，所以 TCP 隧道要靠 `bridge.js` 把 TURN-over-TCP 转成 UDP（STUN 消息按其自带长度分帧，ChannelData 按 2 字节长度 + 4 字节对齐分帧）
