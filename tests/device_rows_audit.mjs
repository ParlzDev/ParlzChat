import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\';
const ROUND = Date.now().toString().slice(-6);
const NAME = 'dv' + ROUND;
const EMAIL = 'devices.' + ROUND + '@parlz.com';
const CODE = '246810';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0.1 Mobile/15E148 Safari/604.1';

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

(async () => {
  console.log('清限流:', php(['clear_rate.php']));
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  php(['dbval.php', 'seed_code', EMAIL, CODE, 'register']);
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    defaultViewport: { width: 1180, height: 820 },
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const id = await page.evaluate(async (u, e, c) => {
    const r = await fetch('/api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', username: u, nickname: '设备压缩', password: 'parlz-dv-2026', email: e, code: c }),
    });
    const j = await r.json();
    return j.ok ? j.user.id : 'ERR:' + JSON.stringify(j);
  }, NAME, EMAIL, CODE);
  if (typeof id !== 'number') {
    throw new Error('注册失败 ' + id);
  }
  const seeded = execFileSync(PHP, ['-r',
    'require "F:/AI-Project/Parlz[Chatter]/includes/bootstrap.php"; db();' +
    '$ua=' + JSON.stringify(JSON.stringify(UA)) + '; $now=time();' +
    'for ($i=0;$i<6;$i++) { $st=db()->prepare("INSERT INTO devices (user_id, token, label, ua, ip, last_seen, created_at) VALUES (?,?,?,?,?,?,?)");' +
    '$st->execute([' + id + ', "tok".$now.$i, $i%2 ? "iPhone · iOS 18.7 · Safari 27.0.1" : "Windows 10/11 · Firefox 157", $ua, "223.74.158.".(10+$i), $now-$i*3600, $now-$i*7200]); }' +
    'echo "seeded=6";'], { encoding: 'utf8', cwd: 'F:/AI-Project/Parlz[Chatter]' });
  console.log(seeded);
  await page.goto(BASE + '/index.php?setting', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.device-row')).map((row) => {
    const ua = row.querySelector('.device-ua');
    const icon = row.querySelector('.device-icon');
    return {
      h: Math.round(row.getBoundingClientRect().height),
      uaLines: ua === null ? 0 : Math.round(ua.getBoundingClientRect().height / 15),
      uaClipped: ua === null ? false : ua.scrollWidth > ua.clientWidth + 1,
      icon: icon === null ? 'none' : Math.round(icon.getBoundingClientRect().width) + 'x' + Math.round(icon.getBoundingClientRect().height),
      overflow: row.scrollWidth > Math.round(row.getBoundingClientRect().width) + 1,
    };
  }));
  console.log('设备行:', JSON.stringify(rows));
  const probe = await page.evaluate(() => ({
    url: location.href,
    appHidden: document.querySelector('#app')?.classList.contains('is-hidden') ?? null,
    authHidden: document.querySelector('#auth-screen')?.classList.contains('is-hidden') ?? null,
    pageBody: document.querySelector('#page-body') === null ? 'none' : 'yes',
    settingRows: document.querySelectorAll('.setting-row').length,
    deviceRows: document.querySelectorAll('.device-row').length,
    headings: Array.from(document.querySelectorAll('#page h2, #page h3, .page-title, .section-title')).map((n) => n.textContent).slice(0, 8),
    text: (document.querySelector('#page')?.textContent ?? '').slice(0, 160),
  }));
  console.log('页面探针:', JSON.stringify(probe));
  const list = await page.evaluate(() => {
    const box = document.querySelector('#page-body') ?? document.body;
    return { pageScrollH: document.documentElement.scrollHeight, vh: window.innerHeight };
  });
  console.log('页面高度:', JSON.stringify(list));
  await page.screenshot({ path: 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit/devices-after.png' });
  await browser.close();
  console.log('清理:', php(['cleanup_test_accounts.php', String(id)]));
  if (rows.length === 0) {
    throw new Error('没找到设备行，判据无效');
  }
  if (rows.some((r) => r.h > 60)) {
    throw new Error('还有超过 60px 的设备行: ' + JSON.stringify(rows));
  }
})().catch((error) => {
  console.error('失败: ' + error.message);
  try {
    console.log(php(['dbval.php', 'ids_like', 'dv']));
  } catch (e) {
    console.log('（清理查询失败）');
  }
  process.exit(1);
});
