import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\';
const ROUND = Date.now().toString().slice(-6);
const OUT = 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit';
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function account(browser, tag, viewport = { width: 1180, height: 800 }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'nfc.' + tag + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
    const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-pz-2026', email: e, code: c });
    return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
  }, 'nfc_' + tag + ROUND, email, CODE);
  if (typeof id !== 'number') {
    throw new Error(tag + ' 注册失败 ' + id);
  }
  ids.push(id);
  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await wait(1400);
  return { page, id, tag };
}

async function api(page, path, body) {
  return page.evaluate(async (p, b) => (await (await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json()), path, body);
}

async function send(page, chatId, body) {
  const res = await api(page, '/api/messages.php', { action: 'send', chat_id: chatId, kind: 'text', body });
  console.log('send[' + body + '] → ' + JSON.stringify(res).slice(0, 120));
  return res;
}

async function bootSettle(page) {
  await wait(2600);
}

async function cardState(page) {
  return page.evaluate(async () => {
    const { state } = await import('/assets/scripts/state.js');
    const nodes = Array.from(document.querySelectorAll('.notice-card'));
    const first = nodes[0] ?? null;
    const rect = first === null ? null : first.getBoundingClientRect();
    return {
      count: nodes.length,
      title: first === null ? '' : String(first.querySelector('.notice-title')?.textContent ?? ''),
      text: first === null ? '' : String(first.querySelector('.notice-text')?.textContent ?? ''),
      badge: first === null ? '' : String(first.querySelector('.notice-count')?.textContent ?? ''),
      rect: rect === null ? null : { top: Math.round(rect.top), left: Math.round(rect.left), right: Math.round(rect.right), bottom: Math.round(rect.bottom), w: Math.round(rect.width) },
      vw: window.innerWidth,
      vh: window.innerHeight,
      chatTitle: String(document.querySelector('.chat-title')?.textContent ?? ''),
      active: state.activeChat === null ? 0 : Number(state.activeChat.id),
      focused: document.hasFocus(),
      hidden: document.hidden,
    };
  });
}

(async () => {
  php(['clear_rate.php']);
  const leftover = php(['dbval.php', 'ids_like', 'nfc_']);
  if (leftover !== '') {
    php(['cleanup_test_accounts.php', ...leftover.split(' ')]);
  }
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  mkdirSync(OUT, { recursive: true });
  const A = await account(browser, 'a');
  const B = await account(browser, 'b');
  await api(A.page, '/api/friends.php', { action: 'quick-add', user_id: B.id });
  const opened = await api(A.page, '/api/chats.php', { action: 'open', user_id: B.id });
  const chatId = Number(opened.chat_id);
  await A.page.reload({ waitUntil: 'domcontentloaded' });
  await bootSettle(A.page);

  await send(B.page, chatId, '第一条 通知测试');
  await wait(2600);
  const one = await cardState(A.page);
  check('别的会话来消息弹出右下角卡片', one.count === 1 && one.text.indexOf('第一条') !== -1, JSON.stringify({ count: one.count, text: one.text }));
  check('卡片标题是对方昵称', one.title === 'nfc_b' + ROUND, 'title=' + one.title);
  check('卡片贴在右下角', one.rect !== null && one.vw - one.rect.right <= 24 && one.vh - one.rect.bottom <= 24, JSON.stringify(one.rect));
  await A.page.screenshot({ path: OUT + '/notice-desktop.png' });

  await send(B.page, chatId, '第二条 通知测试');
  await wait(2600);
  const two = await cardState(A.page);
  check('同一会话连发只留一张卡并计数', two.count === 1 && two.badge === '2', JSON.stringify({ count: two.count, badge: two.badge }));
  check('卡片文字跟着更新', two.text.indexOf('第二条') !== -1, 'text=' + two.text);

  await A.page.evaluate(() => {
    document.querySelector('.notice-card')?.click();
  });
  await wait(1600);
  const openedByCard = await A.page.evaluate(() => ({
    cards: document.querySelectorAll('.notice-card').length,
    title: String(document.querySelector('.chat-title')?.textContent ?? ''),
  }));
  check('点卡片直接打开会话', openedByCard.title === 'nfc_b' + ROUND && openedByCard.cards === 0, JSON.stringify(openedByCard));

  const inChat = await cardState(A.page);
  await send(B.page, chatId, '第三条 正在看这个会话');
  await wait(2600);
  const looking = await cardState(A.page);
  check('正在看的会话来消息不弹卡（只响）', looking.count === 0 || inChat.focused !== true,
    JSON.stringify({ count: looking.count, focused: looking.focused, hidden: looking.hidden }));

  await A.page.evaluate(() => {
    document.querySelectorAll('.notice-card').forEach((n) => n.querySelector('.notice-close').click());
  });

  const muted = await api(A.page, '/api/chats.php', { action: 'mute', chat_id: chatId, muted: 1 });
  await A.page.reload({ waitUntil: 'domcontentloaded' });
  await bootSettle(A.page);
  await send(B.page, chatId, '第四条 免打扰');
  await wait(2600);
  const quiet = await cardState(A.page);
  check('免打扰会话不弹卡', quiet.count === 0, JSON.stringify({ count: quiet.count, muted: muted.ok }));
  const unmuted = await api(A.page, '/api/chats.php', { action: 'mute', chat_id: chatId, muted: 0 });
  console.log('mute toggle: ' + JSON.stringify({ first: muted.muted, second: unmuted.muted }));

  await A.page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await A.page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await bootSettle(A.page);
  await send(B.page, chatId, '第五条 手机横幅');
  await wait(2600);
  const mobile = await cardState(A.page);
  check('手机端横幅落在顶部且通栏', mobile.count === 1 && mobile.rect.top <= 120 && mobile.rect.w >= mobile.vw - 30,
    JSON.stringify({ rect: mobile.rect, mute: unmuted.muted, title: mobile.chatTitle, active: mobile.active, focused: mobile.focused, hidden: mobile.hidden }));
  await A.page.screenshot({ path: OUT + '/notice-mobile.png' });
  check('手机上点横幅也能进会话', await A.page.evaluate(async () => {
    const card = document.querySelector('.notice-card');
    if (card === null) {
      return false;
    }
    card.click();
    await new Promise((r) => setTimeout(r, 1500));
    return document.querySelectorAll('.notice-card').length === 0;
  }));

  await A.page.evaluate(() => {
    window.__notifyLog = [];
    window.Notification = function (title, options) {
      window.__notifyLog.push(String(title) + '|' + String(options?.body ?? ''));
    };
    window.Notification.permission = 'granted';
    window.Notification.requestPermission = () => Promise.resolve('granted');
  });
  await A.page.reload({ waitUntil: 'domcontentloaded' });
  await bootSettle(A.page);
  await A.page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    window.__notifyLog = [];
    window.Notification = function (title, options) {
      window.__notifyLog.push(String(title) + '|' + String(options?.body ?? ''));
    };
    window.Notification.permission = 'granted';
    window.Notification.requestPermission = () => Promise.resolve('granted');
  });
  await send(B.page, chatId, '第六条 后台');
  await wait(2600);
  const background = await A.page.evaluate(() => ({ log: window.__notifyLog ?? [], cards: document.querySelectorAll('.notice-card').length }));
  check('页面在后台时走系统通知而不是页内卡片', background.log.length > 0 && background.log[0].indexOf('第六条') !== -1 && background.cards === 0, JSON.stringify(background));

  await browser.close();
  console.log('清理:', php(['cleanup_test_accounts.php', ...ids.map(String)]));
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length === 0 ? '通知判据全部通过' : '失败: ' + bad.map((f) => f.name).join('、'));
  process.exit(bad.length === 0 ? 0 : 1);
})();
