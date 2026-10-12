const fs = require('fs');
const path = require('path');

const DEFAULT_LOG_DIR = process.env.TURN_LOG_DIR
  || path.join(process.env.ProgramData || 'C:\\ProgramData', 'SakuraFrpService', 'Logs');

const TUNNEL_NAME = process.env.TURN_TUNNEL_NAME || 'parlz-turn';
const LINE = /frpc\[([^|\]]+)\|[^\]]*\]\s*使用\s*>>([A-Za-z0-9.-]+):(\d+)<</;

function newestLogs(dir, limit) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (error) {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.log'))
    .map((name) => {
      const full = path.join(dir, name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch (error) {
        mtime = 0;
      }
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((item) => item.full);
}

function scan(dir) {
  for (const file of newestLogs(dir || DEFAULT_LOG_DIR, 3)) {
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const match = LINE.exec(lines[i]);
      if (match !== null && match[1] === TUNNEL_NAME) {
        return { host: match[2], port: Number(match[3]) };
      }
    }
  }
  return null;
}

function syncTunnel(config, save) {
  if (config.public_source === 'manual') {
    return null;
  }
  const found = scan(process.env.TURN_LOG_DIR || DEFAULT_LOG_DIR);
  if (found === null) {
    return null;
  }
  if (config.public_host === found.host && Number(config.public_port) === found.port) {
    return null;
  }
  config.public_host = found.host;
  config.public_port = found.port;
  config.public_source = 'log';
  save(config);
  return found;
}

module.exports = { syncTunnel, scan };
