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
const PNG = 'C:/Users/JGZ_YES/AppData/Local/Temp/sticker-test.png';
const ROUND = Date.now().toString().slice(-6);
const CODE = '246810';
const ids = [];
const results = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

async function account(browser, tag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'stk.' + tag + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
    const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-stk-2026', email: e, code: c });
    return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
  }, 'stk_' + tag + ROUND, email, CODE);
  if (typeof id !== 'number') {
    throw new Error(tag + ' 注册失败 ' + id);
  }
  ids.push(id);
  return page;
}

async function api(page, path, body) {
  return page.evaluate(async (p, b) => (await (await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json()), path, body);
}

async function measure(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.csticker-img'));
    if (rows.length === 0) {
      return { none: true };
    }
    const img = rows[rows.length - 1];
    const row = img.closest('.msg');
    const bubble = img.closest('.sticker-bubble');
    const avatar = row === null ? null : row.querySelector('.avatar');
    const box = (n) => {
      if (n === null || n === undefined) {
        return null;
      }
      const r = n.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const a = box(avatar);
    const i = box(img);
    const b = box(bubble);
    const hit = a !== null && i !== null && !(i.right <= a.x || i.x >= a.right || i.bottom <= a.y || i.y >= a.bottom);
    return {
      avatar: a,
      img: i,
      bubble: b,
      overlap: hit,
      bubbleContainsImg: b !== null && i !== null && i.x >= b.x - 1 && i.right <= b.right + 1 && i.y >= b.y - 1 && i.bottom <= b.bottom + 1,
      bubbleClass: bubble === null ? '' : bubble.className,
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
  const A = await account(browser, 'a');
  const B = await account(browser, 'b');
  const idA = ids[0];
  const idB = ids[1];

  const code = await api(A, '/api/friends.php', { action: 'face-code' });
  await api(B, '/api/friends.php', { action: 'face-join', code: code.code });
  const dm = await api(A, '/api/chats.php', { action: 'open', user_id: idB });
  const file = await A.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('image', new File([bytes], 'sticker.png', { type: 'image/png' }));
    return (await (await fetch('/api/uploads.php', { method: 'POST', body: form, credentials: 'same-origin' })).json());
  }, readFileSync(PNG).toString('base64'));
  console.log('上传表情素材:', JSON.stringify(file).slice(0, 120));
  await api(A, '/api/messages.php', { action: 'send', chat_id: dm.chat_id, kind: 'csticker', body: file.file });

  await A.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1600));
  await A.evaluate((id) => document.querySelector('[data-chat="' + id + '"]')?.click(), dm.chat_id);
  await new Promise((r) => setTimeout(r, 1600));
  const out = await measure(A);
  console.log('发出方（头像在右）:', JSON.stringify(out));
  check('发出方：表情图不压头像', out.overlap === false, JSON.stringify(out.avatar) + ' vs ' + JSON.stringify(out.img));
  check('发出方：气泡包住图片', out.bubbleContainsImg === true, out.bubbleClass);

  await B.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1600));
  await B.evaluate((id) => document.querySelector('[data-chat="' + id + '"]')?.click(), dm.chat_id);
  await new Promise((r) => setTimeout(r, 1600));
  const inc = await measure(B);
  console.log('接收方（头像在左）:', JSON.stringify(inc));
  check('接收方：表情图不压头像', inc.overlap === false, JSON.stringify(inc.avatar) + ' vs ' + JSON.stringify(inc.img));
  check('接收方：气泡包住图片', inc.bubbleContainsImg === true, inc.bubbleClass);

  const row = await B.$('.msg:last-child');
  if (row !== null) {
    await row.screenshot({ path: OUT + '/sticker-row.png' });
  }
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
