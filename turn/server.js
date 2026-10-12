const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Turn = require('node-turn');
const bridge = require('./bridge');
const tunnelSync = require('./tunnel-sync');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const VIRTUAL = /vEthernet|VirtualBox|VMware|Loopback|Hyper-V|TAP|Npcap/i;
const VIRTUAL_NET = /^192\.168\.(56|64|133)\./;

function lanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }
  const preferred = candidates.find((item) => !VIRTUAL.test(item.name) && !VIRTUAL_NET.test(item.address));
  return (preferred || candidates[0] || { address: '127.0.0.1' }).address;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (parsed && parsed.user && parsed.pass) {
        if (!Array.isArray(parsed.relay_ips) || parsed.relay_ips.length === 0) {
          parsed.relay_ips = [lanIp()];
        }
        return parsed;
      }
    } catch (error) {
      console.error('config.json 读取失败，将重新生成：' + error.message);
    }
  }
  const fresh = {
    user: 'parlz',
    pass: crypto.randomBytes(9).toString('hex'),
    port: 3478,
    public_host: '',
    public_port: 0,
    public_source: '',
    relay_ips: [lanIp()],
  };
  saveConfig(fresh);
  return fresh;
}

const config = loadConfig();
const port = Number(process.env.TURN_PORT || config.port || 3478);

const server = new Turn({
  authMech: 'long-term',
  realm: 'parlz',
  credentials: { [config.user]: config.pass },
  listeningPort: port,
  listeningIps: ['0.0.0.0'],
  relayIps: config.relay_ips,
  minPort: 49152,
  maxPort: 65535,
  debugLevel: process.env.TURN_DEBUG || 'INFO',
});

server.start();

bridge.startBridge({
  listenPort: Number(process.env.TURN_TCP_PORT || port),
  turnPort: port,
  log: (message) => console.log('[' + new Date().toLocaleTimeString() + '] ' + message),
});

console.log('Parlz TURN 已启动');
console.log('  UDP 监听: ' + port + '（TURN 本体）');
console.log('  TCP 监听: ' + port + '（给 frp TCP 隧道用的桥）');
console.log('  中继地址: ' + config.relay_ips.join(', '));
console.log('  账号: ' + config.user);
console.log('  密码: ' + config.pass);

function report() {
  const found = tunnelSync.syncTunnel(config, saveConfig);
  if (found !== null) {
    console.log('已从樱花日志识别到隧道 ' + found.host + ':' + found.port + '，写入 turn/config.json（网站会自动读取）');
  }
}

report();
setInterval(report, 30000);

if (config.public_host === '') {
  console.log('  公网入口: 未设置 —— 在樱花 frp 面板新建一条隧道：名称 parlz-turn、类型 TCP（或 UDP）、本地 127.0.0.1:' + port + '、远程端口任选一个空闲的');
  console.log('            建好后本服务会在 30 秒内自动从日志里认出来，无需再改任何配置');
} else {
  console.log('  公网入口: ' + config.public_host + ':' + config.public_port + (config.public_source === 'log' ? '（自动识别）' : '（手动配置）'));
}
