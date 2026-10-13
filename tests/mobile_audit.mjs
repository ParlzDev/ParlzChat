import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\';
const OUT = 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit';
const CODE = '246810';
const ROUND = Date.now().toString().slice(-6);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ids = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

async function account(browser, tag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'mob.' + tag + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => {
      const r = await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      return r.json();
    };
    let res = await post({ action: 'register', username: u, nickname: u, password: 'parlz-mob-2026', email: e, code: c });
    if (!res.ok) {
      res = await post({ action: 'login', username: u, password: 'parlz-mob-2026' });
    }
    return res.ok ? res.user.id : 'ERR:' + JSON.stringify(res);
  }, 'mob_' + tag + ROUND, email, CODE);
  if (typeof id === 'string') {
    throw new Error(tag + ' 账号失败 ' + id);
  }
  ids.push(id);
  return { page, id, tag };
}

async function audit(page, name) {
  const data = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out = {
      vw: vw,
      vh: vh,
      scrollW: document.documentElement.scrollWidth,
      docScrollH: document.documentElement.scrollHeight,
      overflow: [],
      clipped: [],
      rects: {},
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        return;
      }
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) {
        return;
      }
      if (r.right > vw + 1 || r.left < -1) {
        out.overflow.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0] + ' left=' + Math.round(r.left) + ' right=' + Math.round(r.right));
      }
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && el.children.length === 0) {
        out.clipped.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]) + ' 文字 ' + el.textContent.slice(0, 14));
      }
    });
    const grab = (sel, key) => {
      const el = document.querySelector(sel);
      if (el === null) {
        return;
      }
      const r = el.getBoundingClientRect();
      out.rects[key] = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) };
    };
    grab('.rail', 'rail');
    grab('#gcall-panel', 'gcallPanel');
    grab('#gcall-bar', 'gcallBar');
    grab('#composer', 'composer');
    grab('#chat-body', 'chatBody');
    grab('.chat-head', 'chatHead');
    grab('#panel-head', 'panelHead');
    grab('.panel-head', 'panelHeadAny');
    grab('#chat-notice', 'chatNotice');
    out.overflow = out.overflow.slice(0, 12);
    out.clipped = out.clipped.slice(0, 8);
    return out;
  });
  await page.screenshot({ path: OUT + '/' + name + '.png' });
  console.log('[' + name + '] ' + JSON.stringify(data));
  return data;
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  console.log('截图目录: ' + OUT + '  限流: ' + php(['clear_rate.php']));
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const leftover = php(['dbval.php', 'ids_like', 'mob_']);
  if (leftover !== '') {
    php(['cleanup_test_accounts.php', ...leftover.split(' ')]);
  }
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'],
  });
  const A = await account(browser, 'a');
  const B = await account(browser, 'b');

  await A.page.goto(BASE + '/index.php?chat', { waitUntil: 'networkidle2' });
  await sleep(1200);
  const selfChat = await A.page.evaluate(() => {
    const row = document.querySelector('[data-chat]');
    if (row !== null) {
      row.click();
    }
    return row === null ? 'none' : row.dataset.chat;
  });
  await sleep(900);
  await audit(A.page, '01-DM聊天');
  await A.page.evaluate(() => document.querySelector('#chat-back')?.click());
  await sleep(500);

  const bId = B.id;
  const made = await A.page.evaluate(async () => {
    const r = await fetch('/api/friends.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'face-code' }) });
    return (await r.json()).code;
  });
  await B.page.evaluate(async (code) => {
    await fetch('/api/friends.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'face-join', code }) });
  }, made);
  await A.page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);
  await A.page.evaluate(async (peer) => {
    const r = await fetch('/api/groups.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: '手机版测试群' + Math.floor(Math.random() * 999), member_ids: [peer] }),
    });
    return (await r.json()).chat_id;
  }, bId);
  await A.page.reload({ waitUntil: 'networkidle2' });
  await sleep(1600);
  await audit(A.page, '02-会话列表');

  const groupRow = await A.page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-chat]'));
    const hit = rows.find((r) => (r.textContent ?? '').includes('手机版测试群'));
    if (hit !== null) {
      hit.click();
      return hit.dataset.chat;
    }
    return 'missing';
  });
  await sleep(1400);
  await audit(A.page, '03-群聊打开');
  await A.page.evaluate(() => document.querySelector('#chat-more')?.click() ?? document.querySelector('#more-btn')?.click());
  await sleep(400);
  await audit(A.page, '04-输入栏加号面板');
  await A.page.keyboard.press('Escape');
  await sleep(300);

  await A.page.evaluate(() => document.querySelector('#chat-gcall')?.click());
  await B.page.evaluate(async (id) => {
    const row = Array.from(document.querySelectorAll('[data-chat]')).find((r) => r.dataset.chat === String(id));
    if (row !== undefined) {
      row.click();
    }
  }, groupRow);
  await sleep(900);
  await B.page.evaluate(() => document.querySelector('#chat-gcall')?.click());
  await sleep(900);
  await A.page.evaluate(() => document.querySelector('#chat-info-btn')?.click());
  await sleep(700);
  await A.page.evaluate(() => document.querySelector('#chat-back')?.click());
  await sleep(400);
  await A.page.evaluate(() => document.querySelector('#chat-gcall')?.click());
  await sleep(4000);
  await audit(A.page, '05-群通话面板');
  await B.page.screenshot({ path: OUT + '/05b-对方在通话.png' });

  await A.page.evaluate(() => document.querySelector('#gcall-min')?.click());
  await sleep(500);
  await audit(A.page, '06-群通话收起');
  await A.page.evaluate(() => document.querySelector('#gcall-min')?.click());
  await sleep(400);
  await A.page.goto(BASE + '/index.php?contacts', { waitUntil: 'networkidle2' });
  await sleep(900);
  await A.page.evaluate(() => {
    const box = document.querySelector('#ct-search') ?? document.querySelector('.panel-search input') ?? document.querySelector('#panel-search');
    if (box !== null) {
      box.value = '手机版测试';
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(1400);
  await audit(A.page, '07-通讯录搜群');

  await A.page.goto(BASE + '/index.php?setting', { waitUntil: 'networkidle2' });
  await sleep(1200);
  await audit(A.page, '08-设置页');

  await B.page.evaluate(() => document.querySelector('#gcall-leave')?.click());
  await sleep(2500);
  await A.page.goto(BASE + '/index.php?chat', { waitUntil: 'networkidle2' });
  await sleep(1400);
  await A.page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-chat]'));
    const hit = rows.find((r) => (r.textContent ?? '').includes('手机版测试群'));
    if (hit !== undefined) {
      hit.click();
    }
  });
  await sleep(1200);
  await audit(A.page, '09-加入横幅');
  await A.page.screenshot({ path: OUT + '/09-加入横幅.png' });

  console.log('清理: ' + php(['cleanup_test_accounts.php', ...ids.map(String)]));
  await browser.close();
})().catch(async (error) => {
  console.error('失败: ' + error.message);
  if (ids.length > 0) {
    try {
      console.log(php(['cleanup_test_accounts.php', ...ids.map(String)]));
    } catch (e) {
      console.log('清理失败');
    }
  }
  process.exit(1);
});
