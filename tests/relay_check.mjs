import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = 'https://chat.parlz.com';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HOST = 'root@120.24.78.176';
const D = '/www/sites/chat.parlz.com/index';
const ROUND = Date.now().toString().slice(-6);
const NAME = 'rc' + ROUND;
const EMAIL = 'relaycheck.' + ROUND + '@parlz.com';
const PASS = 'parlz-relay-2026';
const CODE = '135790';

function remote(cmd) {
  return execFileSync('ssh', ['-n', '-p', '6666', HOST, cmd], { encoding: 'utf8' }).trim();
}

(async () => {
  remote(`docker exec PHP-85 php ${D}/tests/clear_rate.php`);
  remote(`docker exec PHP-85 php ${D}/tests/dbval.php seed_code ${EMAIL} ${CODE} register`);
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const auth = await page.evaluate(async (u, e, c, p) => {
    const post = async (b) => {
      const r = await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      return r.json();
    };
    const reg = await post({ action: 'register', username: u, nickname: '中继自检', password: p, email: e, code: c });
    return reg.ok ? { id: reg.user.id, via: 'register' } : { error: reg.error, login: await post({ action: 'login', username: u, password: p }) };
  }, NAME, EMAIL, CODE, PASS);
  console.log('登录:', JSON.stringify(auth));
  const id = auth.id ?? (auth.login && auth.login.user ? auth.login.user.id : 0);
  if (!id) {
    throw new Error('拿不到会话: ' + JSON.stringify(auth));
  }
  const result = await page.evaluate(async () => {
    const m = await import('/assets/scripts/call.js');
    const urls = m.relayUrls();
    const check = await m.relayCheck(9000);
    const ice = await fetch('/api/ice.php', { credentials: 'same-origin' }).then((r) => r.json());
    const t = ice.turn ?? null;
    return { urls, check, turn: t === null ? null : { host: t.host, port: t.port, user: t.user, transport: t.transport, pass_len: String(t.pass ?? '').length } };
  });
  console.log('下发中继地址:', JSON.stringify(result.urls));
  console.log('ice.php turn:', JSON.stringify(result.turn));
  console.log('中继自检:', JSON.stringify(result.check));
  await browser.close();
  remote(`docker exec PHP-85 php ${D}/tests/cleanup_test_accounts.php ${id}`);
  console.log('清理完成');
  if (result.check.ok !== true) {
    process.exit(1);
  }
})().catch((error) => {
  console.error('失败: ' + error.message);
  try {
    remote(`docker exec PHP-85 php ${D}/tests/dbval.php ids_like rc`);
  } catch (e) {
    console.log('（清理查询失败）');
  }
  process.exit(1);
});
