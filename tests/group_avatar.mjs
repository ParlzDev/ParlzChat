import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\';
const OUT = 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit';
const ROUND = Date.now().toString().slice(-6);
const CODE = '246810';
const NAME = 'ga' + ROUND;
const ids = [];
const results = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

const READ = (sel) => {
  const row = document.querySelector(sel);
  if (row === null) {
    return { missing: true, sel };
  }
  const img = row.querySelector('.avatar img');
  const box = row.querySelector('.avatar');
  return {
    sel,
    hasImg: img !== null,
    src: img === null ? '' : String(img.getAttribute('src')),
    loaded: img === null ? false : img.complete && img.naturalWidth > 0,
    initials: box === null ? '' : (box.querySelector('img') === null ? box.textContent.trim() : ''),
    rowText: row.textContent.trim().slice(0, 24),
  };
};

async function api(page, path, body) {
  return page.evaluate(async (p, b) => (await (await fetch(p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })).json()), path, body);
}

(async () => {
  php(['make_png.php', OUT + '/group-avatar.png']);
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('页面异常: ' + e.message));
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  php(['dbval.php', 'seed_code', NAME + '@parlz.com', CODE, 'register']);
  const reg = await page.evaluate(async (u, e, c) => (await (await fetch('/api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', username: u, nickname: '群头像测试', password: 'parlz-ga-2026', email: e, code: c }),
  })).json()), NAME, NAME + '@parlz.com', CODE);
  if (!reg.ok) {
    throw new Error('注册失败 ' + JSON.stringify(reg));
  }
  ids.push(reg.user.id);

  const made = await api(page, '/api/groups.php', { action: 'create', name: '头像群' + ROUND });
  if (!made.ok) {
    throw new Error('建群失败 ' + JSON.stringify(made));
  }
  const chatId = made.chat_id;
  await api(page, '/api/groups.php', { action: 'settings', chat_id: chatId, search_mode: 'keyword', join_mode: 'open' });
  const up = await page.evaluate(async (b64, id) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('action', 'avatar');
    form.append('chat_id', String(id));
    form.append('avatar', new File([bytes], 'g.png', { type: 'image/png' }));
    return (await (await fetch('/api/groups.php', { method: 'POST', body: form, credentials: 'same-origin' })).json());
  }, readFileSync(OUT + '/group-avatar.png').toString('base64'), chatId);
  console.log('群头像上传:', JSON.stringify(up).slice(0, 140));
  check('群头像上传成功', up.ok === true && typeof up.avatar === 'string' && up.avatar !== '', JSON.stringify(up).slice(0, 120));

  await page.goto(BASE + '/index.php?contact', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1800));
  const inContacts = await page.evaluate(READ, '.row[data-act="ct-open"]');
  console.log('通讯录群行:', JSON.stringify(inContacts));
  check('通讯录群列表显示群头像', inContacts.hasImg === true, JSON.stringify(inContacts));
  check('通讯录群头像真的加载出来了', inContacts.loaded === true, String(inContacts.src));

  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1800));
  const inChats = await page.evaluate(READ, '[data-chat="' + chatId + '"]');
  console.log('会话列表群行:', JSON.stringify(inChats));
  check('会话列表显示群头像', inChats.hasImg === true, JSON.stringify(inChats));
  check('两处头像指向同一个文件', inChats.hasImg === true && inContacts.hasImg === true && inChats.src === inContacts.src,
    inChats.src + ' vs ' + inContacts.src);

  await page.goto(BASE + '/index.php?contact', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.type('#panel-search', '头像群');
  await new Promise((r) => setTimeout(r, 1800));
  const inSearch = await page.evaluate(READ, '.row:has([data-act="ct-join"])');
  console.log('搜群结果行:', JSON.stringify(inSearch));
  check('搜群结果也显示群头像', inSearch.hasImg === true, JSON.stringify(inSearch));
  await page.screenshot({ path: OUT + '/group-avatar-contacts.png' });

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
