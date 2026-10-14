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
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('页面异常: ' + e.message));
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const name = 'gc' + tag + ROUND;
  php(['dbval.php', 'seed_code', name + '@parlz.com', CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => (await (await fetch('/api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', username: u, nickname: u, password: 'parlz-gc-2026', email: e, code: c }),
  })).json()), name, name + '@parlz.com', CODE);
  if (!id.ok) {
    throw new Error(tag + ' 注册失败 ' + JSON.stringify(id));
  }
  ids.push(id.user.id);
  return { page, id: id.user.id, name };
}

async function api(page, path, body) {
  return page.evaluate(async (p, b) => (await (await fetch(p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })).json()), path, body);
}

const wait = async (ms) => new Promise((r) => setTimeout(r, ms));

async function openChat(page, chatId) {
  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await wait(1700);
  await page.waitForSelector('[data-chat="' + chatId + '"]', { timeout: 6000 });
  await page.click('[data-chat="' + chatId + '"]');
  await wait(1300);
}

async function cardState(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.group-card');
    if (card === null) {
      return { missing: true };
    }
    const img = card.querySelector('.avatar img');
    return {
      missing: false,
      id: Number(card.dataset.groupCard),
      name: card.querySelector('.group-card-name') === null ? '' : card.querySelector('.group-card-name').textContent.trim(),
      sub: card.querySelector('.group-card-sub') === null ? '' : card.querySelector('.group-card-sub').textContent.trim(),
      tag: card.querySelector('.group-card-tag') === null ? '' : card.querySelector('.group-card-tag').textContent.trim(),
      hasImg: img !== null,
      src: img === null ? '' : String(img.getAttribute('src')),
      loaded: img === null ? false : img.complete && img.naturalWidth > 0,
      jsonLeak: card.textContent.includes('chat_id'),
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

  const code = await api(A.page, '/api/friends.php', { action: 'face-code' });
  await api(B.page, '/api/friends.php', { action: 'face-join', code: code.code });
  const dm = await api(A.page, '/api/chats.php', { action: 'open', user_id: B.id });
  const made = await api(A.page, '/api/groups.php', { action: 'create', name: '名片群' + ROUND });
  const gid = made.chat_id;
  await api(A.page, '/api/groups.php', { action: 'settings', chat_id: gid, search_mode: 'keyword', join_mode: 'open' });
  const gUid = 'A' + String(gid).padStart(5, '0');
  php(['make_png.php', OUT + '/group-card-avatar.png']);
  const up = await A.page.evaluate(async (b64, id) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('action', 'avatar');
    form.append('chat_id', String(id));
    form.append('avatar', new File([bytes], 'g.png', { type: 'image/png' }));
    return (await (await fetch('/api/groups.php', { method: 'POST', body: form, credentials: 'same-origin' })).json());
  }, readFileSync(OUT + '/group-card-avatar.png').toString('base64'), gid);
  check('先给群传一个头像', up.ok === true, JSON.stringify(up).slice(0, 100));

  await openChat(A.page, gid);
  await A.page.click('#chat-info-btn');
  await A.page.waitForSelector('[data-act="act-share"]', { timeout: 6000 });
  await A.page.click('[data-act="act-share"]');
  await A.page.waitForSelector('[data-act="act-card-send"]', { timeout: 6000 });
  const disabledAtFirst = await A.page.evaluate(() => document.querySelector('[data-act="act-card-send"]').disabled);
  check('没选会话时发送按钮是禁用的', disabledAtFirst === true, String(disabledAtFirst));
  await A.page.click('[data-act="act-card-pick"][data-id="' + dm.chat_id + '"]');
  await wait(700);
  const picked = await A.page.evaluate(() => ({
    on: document.querySelectorAll('.forward-row.is-picked').length,
    label: document.querySelector('[data-act="act-card-send"]') === null ? '' : document.querySelector('[data-act="act-card-send"]').textContent.trim(),
    disabled: document.querySelector('[data-act="act-card-send"]').disabled,
  }));
  check('选中的会话标成已选', picked.on === 1 && picked.disabled === false, JSON.stringify(picked));
  await A.page.click('[data-act="act-card-send"]');
  await wait(1800);
  const sent = await A.page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((n) => n.textContent.trim()));
  check('发送后给出成功提示', sent.some((t) => t.includes('群名片')), JSON.stringify(sent));

  await openChat(B.page, dm.chat_id);
  const bCard = await cardState(B.page);
  console.log('B 看到的卡片:', JSON.stringify(bCard));
  check('对方收到群名片卡片', bCard.missing === false, JSON.stringify(bCard));
  check('卡片显示群名', bCard.name === '名片群' + ROUND, String(bCard.name));
  check('卡片显示群号和人数', bCard.sub === gUid + ' · 1 人', String(bCard.sub));
  check('卡片带群头像且真的加载', bCard.hasImg === true && bCard.loaded === true && bCard.src.includes(up.avatar), JSON.stringify(bCard));
  check('卡片上不露 JSON', bCard.jsonLeak === false, String(bCard.jsonLeak));

  const preview = await B.page.evaluate((chatId) => {
    const row = document.querySelector('[data-chat="' + chatId + '"]');
    return row === null ? '' : row.textContent;
  }, dm.chat_id);
  check('会话列表预览写成 [群名片]', preview.includes('[群名片]'), preview.slice(0, 90));

  const early = await api(B.page, '/api/messages.php', { action: 'send', chat_id: dm.chat_id, kind: 'groupcard', body: String(gid) });
  check('不在群里的人分享不了这个群的名片', early.ok === false && String(early.error).includes('不在那个群'), JSON.stringify(early).slice(0, 120));

  await B.page.click('.group-card');
  await B.page.waitForSelector('[data-act="act-card-join"]', { timeout: 6000 }).catch(() => {});
  const dialog = await B.page.evaluate(() => ({
    title: document.querySelector('#drawer-title') === null ? '' : document.querySelector('#drawer-title').textContent.trim(),
    open: document.querySelector('#drawer').classList.contains('is-open'),
    join: document.querySelector('[data-act="act-card-join"]') === null ? '' : document.querySelector('[data-act="act-card-join"]').textContent.trim(),
    body: document.querySelector('#drawer-body') === null ? '' : document.querySelector('#drawer-body').textContent.replace(/\s+/g, ' ').slice(0, 120),
  }));
  console.log('B 的群名片弹窗:', JSON.stringify(dialog));
  check('非成员点卡片弹出群名片', dialog.open === true && dialog.title === '群名片', JSON.stringify(dialog));
  check('开放群显示「加入群聊」', dialog.join === '加入群聊', String(dialog.join));
  await wait(700);
  await B.page.screenshot({ path: OUT + '/group-card-dialog.png' });

  await B.page.click('[data-act="act-card-join"]');
  await wait(2200);
  const bChats = await B.page.evaluate(() => Array.from(document.querySelectorAll('[data-chat]')).map((n) => n.dataset.chat));
  check('加入后群会话出现在对方列表', bChats.includes(String(gid)), JSON.stringify(bChats));

  await api(A.page, '/api/messages.php', { action: 'send', chat_id: dm.chat_id, kind: 'groupcard', body: String(gid) });
  await openChat(B.page, dm.chat_id);
  await B.page.click('.group-card');
  await wait(1200);
  const nowMember = await B.page.evaluate(() => ({
    drawer: document.querySelector('#drawer').classList.contains('is-open'),
    url: window.location.search,
    head: document.querySelector('#chat-head') === null ? '' : document.querySelector('#chat-head').textContent.replace(/\s+/g, ' ').slice(0, 40),
  }));
  check('已成员点卡片直接进群聊', nowMember.drawer === false && nowMember.head.includes('名片群'), JSON.stringify(nowMember));

  const outsider = await api(B.page, '/api/messages.php', { action: 'send', chat_id: dm.chat_id, kind: 'groupcard', body: '999999' });
  check('分享不存在的群被拒绝', outsider.ok === false, JSON.stringify(outsider).slice(0, 120));

  const c = await account(browser, 'c');
  const closedByStranger = await api(c.page, '/api/groups.php', { action: 'settings', chat_id: gid, search_mode: 'keyword', join_mode: 'none' });
  check('非群主改不了加群方式', closedByStranger.ok === false, JSON.stringify(closedByStranger).slice(0, 110));
  const ownerClosed = await api(A.page, '/api/groups.php', { action: 'settings', chat_id: gid, search_mode: 'keyword', join_mode: 'none' });
  check('群主可以把群设为不允许加入', ownerClosed.ok === true, JSON.stringify(ownerClosed).slice(0, 110));

  const cCard = await c.page.evaluate(async (id) => (await (await fetch('/api/groups.php?action=card&chat_id=' + id))).json(), gid);
  check('未加入的人也能看到群名片资料', cCard.ok === true && cCard.card.join_mode === 'none' && cCard.card.is_member === false,
    JSON.stringify(cCard).slice(0, 160));
  check('名片资料不泄露成员名单', typeof cCard.card.members === 'number' && cCard.card.members === 2 && Array.isArray(cCard.card.members) === false,
    JSON.stringify(cCard.card).slice(0, 140));
  const cJoin = await api(c.page, '/api/groups.php', { action: 'join', chat_id: gid });
  check('不允许加入的群会拒绝加入', cJoin.ok === false && String(cJoin.error).includes('不允许'), JSON.stringify(cJoin).slice(0, 110));

  const spoof = await api(A.page, '/api/messages.php', {
    action: 'send', chat_id: dm.chat_id, kind: 'groupcard',
    body: JSON.stringify({ chat_id: gid, name: '假群名', avatar: 'evil.webp', uid: 'A00001', members: 9999 }),
  });
  const stored = await A.page.evaluate(async (chatId) => {
    const res = await (await fetch('/api/messages.php?chat_id=' + chatId + '&before=0&limit=50')).json();
    return (res.messages ?? []).filter((m) => m.kind === 'groupcard').map((m) => String(m.body));
  }, dm.chat_id);
  const all = stored.join(' ');
  check('卡片内容以数据库为准，客户端伪造无效', spoof.ok === true && stored.length >= 2
    && all.includes('假群名') === false && all.includes('evil.webp') === false && all.includes('9999') === false
    && all.includes('名片群') === true, all.slice(0, 220));

  const fav = await api(B.page, '/api/favorites.php', { action: 'add', kind: 'groupcard', body: JSON.stringify({ chat_id: gid, uid: gUid, name: '名片群' + ROUND, avatar: '', members: 2 }) });
  const favList = await B.page.evaluate(async () => (await (await fetch('/api/favorites.php'))).json());
  const favRow = (favList.favorites ?? []).find((f) => f.id === fav.id);
  check('收藏群名片存成文字而不是 JSON', favRow !== undefined && favRow.body.includes('[群名片]') && favRow.body.includes('chat_id') === false, JSON.stringify(favRow).slice(0, 140));

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
