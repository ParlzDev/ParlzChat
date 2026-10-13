import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8437';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const DBVAL = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\dbval.php';
const CLEANUP = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\cleanup_test_accounts.php';
const CLEAR_RATE = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\clear_rate.php';
const CODE = '246810';
const ROUND = Date.now().toString().slice(-6);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chatId = 0;
const ids = [];
const pages = [];

function php(args) {
  return execFileSync(PHP, args, { encoding: 'utf8' }).trim();
}

function api(page, path, body) {
  return page.evaluate(async (p, b) => {
    const r = await fetch(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(b),
    });
    return r.json();
  }, path, body);
}

async function account(page, tag) {
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'gcb.' + tag + ROUND + '@parlz.com';
  php([DBVAL, 'seed_code', email, CODE, 'register']);
  return page.evaluate(async (u, e, c) => {
    const post = async (b) => {
      const r = await fetch('/api/auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      return r.json();
    };
    let res = await post({ action: 'register', username: u, nickname: u, password: 'parlz-gcb-2026', email: e, code: c });
    if (!res.ok) {
      const again = await post({ action: 'login', username: u, password: 'parlz-gcb-2026' });
      if (!again.ok) {
        return 'ERR register=' + JSON.stringify(res) + ' login=' + JSON.stringify(again);
      }
      return again.user.id;
    }
    return res.user.id;
  }, 'gcb_' + tag + ROUND, email, CODE);
}

async function befriend(a, b) {
  const made = await api(a.page, '/api/friends.php', { action: 'face-code' });
  const joined = await api(b.page, '/api/friends.php', { action: 'face-join', code: made.code });
  return joined.ok === true ? 'ok' : ('ERR:' + JSON.stringify(joined));
}

function tilesState(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#gcall-list .gcall-tile'));
    return {
      panelShown: !document.querySelector('#gcall-panel').classList.contains('is-hidden'),
      tiles: rows.length,
      connected: rows.filter((r) => r.querySelector('.gcall-tile-state')?.textContent === '已接通').length,
      states: rows.map((r) => (r.querySelector('.gcall-tile-name')?.textContent ?? '') + '/' + (r.querySelector('.gcall-tile-state')?.textContent ?? '')),
      sinks: document.querySelectorAll('#gcall-sinks audio').length,
      count: document.querySelector('#gcall-count')?.textContent ?? '',
    };
  });
}

async function waitFor(predicate, ms, step = 500, label = '') {
  const deadline = Date.now() + ms;
  let last = null;
  let tick = 0;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last === true || (last && last.done === true)) {
      return last === true ? {} : last;
    }
    tick += 1;
    if (label !== '' && tick % 8 === 0) {
      const probe = await Promise.all(pages.map(async (p) => ({
        tag: p.tag,
        cli: await p.page.evaluate(() => (window.__gcall ? window.__gcall.debugState() : 'no-module')),
        st: await api(p.page, '/api/groupcall.php', { action: 'poll', chat_id: chatId, after: 0 }).then((r) => ({
          members: (r.members ?? []).length,
          in_call: r.in_call,
          kinds: Array.from(new Set((r.signals ?? []).map((s) => s.kind))).join('+'),
        })).catch(() => 'ERR'),
      })));
      console.log('  等待[' + label + '] 第' + tick + '轮: 服务端=' + JSON.stringify(probe));
    }
    await sleep(step);
  }
  throw new Error('超时，最后状态: ' + JSON.stringify(last));
}

(async () => {

  console.log('清限流:', php([CLEAR_RATE]));
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const leftover = php([DBVAL, 'ids_like', 'gcb_']);
  if (leftover !== '') {
    console.log('清掉上一轮遗留账号:', leftover);
    php([CLEANUP, ...leftover.split(' ')]);
  }
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    defaultViewport: { width: 1180, height: 800 },
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-gpu',
    ],
  });
  const errors = [];
  for (const tag of ['a', 'b', 'c']) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(tag + ': ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') {
        errors.push(tag + ' console: ' + m.text());
      }
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !/\/api\/poll\.php$/.test(r.url())) {
        errors.push(tag + ' http ' + r.status() + ' ' + r.url());
      }
    });
    const id = await account(page, tag);
    if (typeof id === 'string') {
      console.log(php([DBVAL, 'rate_dump']));
      throw new Error('账号创建失败 ' + tag + ' ' + id);
    }
    ids.push(id);
    pages.push({ page, id, tag });
    await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  }
  console.log('账号 id:', ids.join(', '));

  for (const pair of [[0, 1], [0, 2], [1, 2]]) {
    console.log('好友 ' + pair.join('-') + ':', await befriend(pages[pair[0]], pages[pair[1]]));
  }
  const created = await api(pages[0].page, '/api/groups.php', { action: 'create', name: 'gcb' + ROUND, member_ids: [ids[1], ids[2]] });
  if (typeof created.chat_id !== 'number' || created.invited !== 2) {
    throw new Error('建群失败: ' + JSON.stringify(created));
  }
  chatId = created.chat_id;
  console.log('群 chat_id:', chatId, 'invited:', created.invited);

  for (const p of pages) {
    const result = await p.page.evaluate(async (id) => {
      const found = async (sel, ms) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          const node = document.querySelector(sel);
          if (node !== null) {
            return node;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
        return null;
      };
      const row = await found('[data-chat="' + id + '"]', 12000);
      if (row === null) {
        return 'no-chat-row';
      }
      row.click();
      const btn = await found('#chat-gcall', 6000);
      if (btn === null) {
        return 'no-gcall-button';
      }
      btn.click();
      const m = await import('/assets/scripts/gcall.js');
      window.__gcall = m;
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      return 'joined:' + JSON.stringify(m.debugState());
    }, chatId);
    console.log('  ' + p.tag + ' -> ' + result);
  }

  const joinedState = await Promise.all(pages.map(async (p) => ({ tag: p.tag, ...(await tilesState(p.page)) })));
  console.log('加入后:', JSON.stringify(joinedState));

  const verdict = await waitFor(async () => {
    const rows = await Promise.all(pages.map(async (p) => ({ tag: p.tag, ...(await tilesState(p.page)) })));
    const ok = rows.every((r) => r.panelShown && r.tiles === 3 && r.connected === 2 && r.sinks === 2);
    return ok ? { done: true, rows } : { done: false, rows };
  }, 40000);
  console.log('三方互通:', JSON.stringify(verdict.rows));

  const muted = await api(pages[1].page, '/api/groupcall.php', { action: 'mute', chat_id: chatId, muted: '1' });
  await sleep(2600);
  const afterMute = await Promise.all(pages.map(async (p) => ({ tag: p.tag, off: await p.page.evaluate(() => document.querySelectorAll('#gcall-list .gcall-tile-mic.is-off').length) })));
  console.log('静音后 is-off 数量:', JSON.stringify(afterMute), 'api ok=', muted.ok);

  await pages[1].page.evaluate(() => document.querySelector('#gcall-leave')?.click());
  const left = await waitFor(async () => {
    const rows = await Promise.all(pages.map(async (p) => ({ tag: p.tag, ...(await tilesState(p.page)) })));
    const a = rows.find((r) => r.tag === 'a');
    const b = rows.find((r) => r.tag === 'b');
    const ok = a.tiles === 2 && a.sinks === 1 && b.panelShown === false;
    return ok ? { done: true, rows } : { done: false, rows };
  }, 60000, 500, 'leave');
  console.log('B 离开后:', JSON.stringify(left.rows));

  for (const p of [pages[0], pages[2]]) {
    await p.page.evaluate(() => document.querySelector('#gcall-leave')?.click());
  }
  await sleep(1200);
  const afterAll = await Promise.all(pages.map(async (p) => ({ tag: p.tag, ...(await tilesState(p.page)) })));
  console.log('全员离开:', JSON.stringify(afterAll));

  const fatal = errors.filter((e) => !/favicon|ResizeObserver|AudioContext was not allowed|api\/stickers\.php|status of 401/i.test(e));
  console.log('全部错误(' + errors.length + '): ' + (errors.length === 0 ? '无' : errors.join(' | ')));
  console.log(fatal.length === 0 ? '没有致命页面错误' : '致命错误:\n' + fatal.join('\n'));

  php([CLEANUP, ...ids.map(String)]);
  await browser.close();
  if (fatal.length > 0) {
    process.exit(1);
  }
})().catch(async (error) => {
  console.error('失败:', error.message);
  if (ids.length > 0) {
    try {
      console.log(php([CLEANUP, ...ids.map(String)]));
    } catch (cleanupError) {
      console.log('清理失败: ' + cleanupError.message);
    }
  }
  process.exit(1);
});
