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

async function account(browser, tag, width) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
    const box = (n) => {
      const r = n.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const host = document.querySelector('#chat-body');
    const rows = Array.from(document.querySelectorAll('.msg')).filter((m) => m.querySelector('.csticker-img') !== null);
    return {
      hostBox: host === null ? null : box(host),
      rows: rows.map((row) => {
        const img = row.querySelector('.csticker-img');
        const bubble = row.querySelector('.sticker-bubble');
        const avatar = row.querySelector('.avatar');
        const mine = row.classList.contains('msg-mine');
        const a = box(avatar);
        const b = box(bubble);
        const i = box(img);
        const gap = mine ? a.x - i.right : i.x - a.right;
        return {
          mine,
          avatar: a,
          bubble: b,
          img: i,
          gap,
          hit: !(i.right <= a.x || i.x >= a.right || i.bottom <= a.y || i.y >= a.bottom),
          contains: i.x >= b.x - 1 && i.right <= b.right + 1 && i.y >= b.y - 1 && i.bottom <= b.bottom + 1,
          bubbleClass: bubble.className,
          rowRight: box(row).right,
          rowX: box(row).x,
        };
      }),
    };
  });
}

function judge(label, data) {
  check(label + '：聊天里有表情包', data.rows.length > 0, 'rows=' + data.rows.length);
  data.rows.forEach((r, index) => {
    check(label + ' 第' + (index + 1) + '条：表情不压自己头像', r.hit === false, 'avatar ' + JSON.stringify(r.avatar) + ' img ' + JSON.stringify(r.img));
    check(label + ' 第' + (index + 1) + '条：表情与头像留 >=4px 间隙', r.gap >= 4, 'gap=' + r.gap);
    check(label + ' 第' + (index + 1) + '条：气泡完整包住图片', r.contains === true, r.bubbleClass);
    check(label + ' 第' + (index + 1) + '条：整行没超出聊天区', r.rowX >= (data.hostBox === null ? 0 : data.hostBox.x - 1) && r.rowRight <= (data.hostBox === null ? 9999 : data.hostBox.right + 1), 'row ' + r.rowX + '..' + r.rowRight + ' host ' + JSON.stringify(data.hostBox));
  });
}

async function openChat(page, chatId) {
  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1600));
  await page.evaluate((id) => document.querySelector('[data-chat="' + id + '"]')?.click(), chatId);
  await new Promise((r) => setTimeout(r, 1600));
}

(async () => {
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const A = await account(browser, 'a', 390);
  const B = await account(browser, 'b', 390);
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
  await api(B, '/api/messages.php', { action: 'send', chat_id: dm.chat_id, kind: 'csticker', body: file.file });

  await openChat(A, dm.chat_id);
  const wide = await measure(A);
  console.log('390px 双向往:', JSON.stringify(wide.rows.map((r) => ({ mine: r.mine, gap: r.gap, hit: r.hit }))));
  judge('390px·发出方', wide);
  await A.evaluate(() => document.querySelectorAll('.sticker-bubble').forEach((n) => n.classList.remove('is-custom')));
  const stale = await measure(A);
  console.log('旧 JS（没有 is-custom）:', JSON.stringify(stale.rows.map((r) => ({ mine: r.mine, gap: r.gap, hit: r.hit }))));
  judge('旧 JS·发出方', stale);
  const outRow = await A.$('.msg.msg-mine:last-of-type');
  if (outRow !== null) {
    await outRow.screenshot({ path: OUT + '/sticker-row-out.png' });
  }

  await openChat(B, dm.chat_id);
  const inc = await measure(B);
  console.log('390px 接收方:', JSON.stringify(inc.rows.map((r) => ({ mine: r.mine, gap: r.gap, hit: r.hit }))));
  judge('390px·接收方', inc);
  const inRow = await B.$('.msg:not(.msg-mine)');
  if (inRow !== null) {
    await inRow.screenshot({ path: OUT + '/sticker-row-in.png' });
  }

  await A.setViewport({ width: 320, height: 700, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 900));
  judge('320px·发出方', await measure(A));

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
