const net = require('net');
const dgram = require('dgram');

function startBridge(options) {
  const listenPort = Number(options.listenPort || 3478);
  const turnHost = options.turnHost || '127.0.0.1';
  const turnPort = Number(options.turnPort || 3478);
  const log = options.log || console.log;

  const debug = process.env.TURN_DEBUG_BRIDGE === '1';
  const server = net.createServer((socket) => {
    const udp = dgram.createSocket('udp4');
    let pending = Buffer.alloc(0);
    let alive = true;
    let toServer = 0;
    let toClient = 0;

    if (debug) {
      log('TCP 客户端接入 ' + socket.remoteAddress + ':' + socket.remotePort);
    }

    const close = () => {
      if (!alive) {
        return;
      }
      alive = false;
      try {
        udp.close();
      } catch (error) {
        void error;
      }
    };

    udp.on('message', (message) => {
      if (!alive) {
        return;
      }
      toClient += 1;
      if (debug && toClient <= 5) {
        log('TURN → 客户端 ' + message.length + ' 字节（第 ' + toClient + ' 包）');
      }
      socket.write(message);
    });
    udp.on('error', close);

    let rawLogged = 0;
    socket.on('data', (chunk) => {
      if (debug && rawLogged < 3) {
        rawLogged += 1;
        log('原始 ' + chunk.length + ' 字节: ' + chunk.subarray(0, 24).toString('hex'));
      }
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4) {
        const head = pending.readUInt16BE(0);
        let length = 0;
        if ((head & 0xC000) === 0x4000) {
          length = 4 + pending.readUInt16BE(2);
          length += (4 - (length % 4)) % 4;
        } else {
          length = 20 + pending.readUInt16BE(2);
        }
        if (length <= 0 || length > 65535) {
          pending = Buffer.alloc(0);
          close();
          return;
        }
        if (pending.length < length) {
          break;
        }
        const message = pending.subarray(0, length);
        pending = pending.subarray(length);
        toServer += 1;
        if (debug && toServer <= 5) {
          log('客户端 → TURN ' + message.length + ' 字节（第 ' + toServer + ' 包）');
        }
        udp.send(message, turnPort, turnHost);
      }
    });
    socket.on('close', close);
    socket.on('error', close);
  });

  server.on('error', (error) => {
    log('TURN TCP 桥启动失败：' + error.message);
  });
  server.listen(listenPort, '0.0.0.0', () => {
    log('TURN TCP 桥已监听 ' + listenPort + '（转发到 ' + turnHost + ':' + turnPort + '/udp）');
  });

  return server;
}

module.exports = { startBridge };
