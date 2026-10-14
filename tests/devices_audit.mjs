import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\';
const OUT = 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit';
const ROUND = Date.now().toString().slice(-6);
const CODE = '246810';
const NAME = 'dv' + ROUND;
const PASS = 'parlz-dv-2026';
const ids = [];
const results = [];

const UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

async function login(page, ua) {
  if (ua !== null) {
    await page.setUserAgent(ua);
  }
  return page.evaluate(async (u, p) => (await (await fetch('/api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: u, password: p }),
  })).json()), NAME, PASS);
}

async function devices(page) {
  return page.evaluate(async () => {
    const res = await (await fetch('/api/profile.php')).json();
    return res.devices ?? [];
  });
}

async function ui(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.device-row'));
    const block = rows.length === 0 ? null : rows[0].closest('.setting-block');
    const toggle = document.querySelector('[data-act="st-dev-toggle"]');
    const box = block === null ? null : block.getBoundingClientRect();
    const first = rows.slice(0, 5).some((r) => r.querySelector('.pending-tag') !== null);
    return {
      rows: rows.length,
      blockH: box === null ? 0 : Math.round(box.height),
      toggle: toggle === null ? null : toggle.textContent.trim(),
      currentInPreview: first,
      settingsHeight: Math.round(document.querySelector('.page-body') === null ? document.body.scrollHeight : document.querySelector('.page-body').scrollHeight),
    };
  });
}

(async () => {
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1180, height: 800, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('页面异常: ' + e.message));
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  php(['dbval.php', 'seed_code', NAME + '@parlz.com', CODE, 'register']);
  const reg = await page.evaluate(async (u, p, e, c) => (await (await fetch('/api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', username: u, nickname: '设备测试', password: p, email: e, code: c }),
  })).json()), NAME, PASS, NAME + '@parlz.com', CODE);
  if (!reg.ok) {
    throw new Error('注册失败 ' + JSON.stringify(reg));
  }
  ids.push(reg.user.id);

  for (const ua of UAS) {
    const res = await login(page, ua);
    if (!res.ok) {
      throw new Error('登录失败 ' + JSON.stringify(res));
    }
  }
  let list = await devices(page);
  check('每台设备一行', list.length === UAS.length + 1, 'devices=' + list.length);

  const before = list.length;
  for (let i = 0; i < 3; i += 1) {
    await login(page, UAS[0]);
  }
  list = await devices(page);
  check('同一浏览器重复登录不再堆行', list.length === before, before + ' -> ' + list.length);
  const ua0 = list.filter((d) => String(d.ua) === UAS[0]).length;
  check('同一 UA 只保留一条记录', ua0 === 1, 'matched=' + ua0);

  await page.goto(BASE + '/index.php?setting', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1800));
  const collapsed = await ui(page);
  console.log('收起时:', JSON.stringify(collapsed));
  check('默认只渲染 5 行设备', collapsed.rows === 5, 'rows=' + collapsed.rows);
  check('当前设备在首屏 5 行内', collapsed.currentInPreview === true, String(collapsed.currentInPreview));
  check('登录设备区块不超过 470px', collapsed.blockH <= 470, 'h=' + collapsed.blockH);
  check('展开按钮写清总台数', collapsed.toggle === '展开全部 ' + list.length + ' 台设备', String(collapsed.toggle));

  await page.click('[data-act="st-dev-toggle"]');
  await new Promise((r) => setTimeout(r, 700));
  const expanded = await ui(page);
  console.log('展开时:', JSON.stringify(expanded));
  check('展开后列出全部设备', expanded.rows === list.length, 'rows=' + expanded.rows);
  check('展开后按钮变成收起', expanded.toggle === '收起设备列表', String(expanded.toggle));
  await page.screenshot({ path: OUT + '/devices-expanded.png' });

  await page.click('[data-act="st-dev-toggle"]');
  await new Promise((r) => setTimeout(r, 700));
  check('再点收起回到 5 行', (await ui(page)).rows === 5, 'rows=' + (await ui(page)).rows);

  const tapped = await page.evaluate(async () => {
    const btn = document.querySelector('[data-act="st-revoke-others"]');
    if (btn === null) {
      return { missing: true };
    }
    const armedAtWire = btn.dataset.armed ?? '';
    btn.click();
    await new Promise((r) => setTimeout(r, 150));
    const label = btn.textContent.trim();
    btn.click();
    await new Promise((r) => setTimeout(r, 1500));
    const toasts = Array.from(document.querySelectorAll('#toast-wrap .toast')).map((n) => n.textContent.trim());
    const list = (await (await fetch('/api/profile.php')).json()).devices ?? [];
    return { armedAtWire, label, toasts, after: list.length };
  });
  console.log('退出其他设备:', JSON.stringify(tapped));
  check('按钮接线在点击里（装线时不该已武装）', tapped.armedAtWire !== '1', JSON.stringify(tapped));
  check('第一次点击变成"再点一次确认"', tapped.label === '再点一次确认', String(tapped.label));
  check('退出其他设备后只剩当前一台', tapped.after === 1, 'after=' + tapped.after);
  check('退出后给出提示', tapped.toasts.includes('已退出其他设备') === true, JSON.stringify(tapped.toasts));
  const left = (await devices(page)).length;
  check('刷新后仍是 1 台', left === 1, 'left=' + left);

  await page.goto(BASE + '/index.php?setting', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  const solo = await ui(page);
  check('一台设备时不出现展开按钮', solo.toggle === null, String(solo.toggle));
  await page.screenshot({ path: OUT + '/devices-solo.png' });

  await browser.close();
  console.log('清理:', php(['cleanup_test_accounts.php', ...ids.map(String)]));
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length === 0 ? '全部通过 (' + results.length + ')' : '失败: ' + bad.map((f) => f.name).join('、'));
  if (bad.length > 0) {
    process.exit(1);
  }
})().catch(async (error) => {
  console.error('异常: ' + error.message);
  if (ids.length > 0) {
    try {
      console.log(php(['cleanup_test_accounts.php', ...ids.map(String)]));
    } catch (e) {
      console.log('清理失败');
    }
  }
  process.exit(1);
});
