import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\';
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

const AUDIT = () => {
  const host = document.getElementById('page-view');
  const body = host === null ? null : host.querySelector(':scope > .page-body');
  if (body === null || host === null) {
    return { missing: true };
  }
  const cs = getComputedStyle(body);
  const text = body.innerText === null ? '' : body.innerText;
  const last = body.lastElementChild;
  body.scrollTop = 0;
  const top0 = body.scrollTop;
  body.scrollTop = 999999;
  const scrolledTo = body.scrollTop;
  const lastBottom = last === null ? 0 : Math.round(last.getBoundingClientRect().bottom);
  const bodyBottom = Math.round(body.getBoundingClientRect().bottom);
  body.scrollTop = 0;
  const backToTop = body.scrollTop;
  const hostKids = Array.from(host.children).map((n) => n.className.split(' ')[0]);
  const stray = hostKids.filter((c) => c !== 'page-head' && c !== 'page-view' && c !== 'page-body');
  return {
    hostKids,
    stray,
    client: body.clientHeight,
    content: body.scrollHeight,
    canScroll: body.scrollHeight > body.clientHeight + 1,
    scrollTopWorks: scrolledTo > 0,
    scrollBackWorks: backToTop === top0,
    lastVisible: last === null ? false : lastBottom <= bodyBottom + 2,
    lastBottom,
    bodyBottom,
    overflowY: cs.overflowY,
    nan: /NaN/.test(text),
    blocks: body.querySelectorAll(':scope > .setting-block, :scope > .profile-card').length,
  };
};

(async () => {
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  page.on('pageerror', (e) => console.log('页面异常: ' + e.message));
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const name = 'sa' + ROUND;
  php(['dbval.php', 'seed_code', name + '@parlz.com', CODE, 'register']);
  const reg = await page.evaluate(async (u, e, c) => (await (await fetch('/api/auth.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', username: u, nickname: '滚动审计', password: 'parlz-sa-2026', email: e, code: c }),
  })).json()), name, name + '@parlz.com', CODE);
  ids.push(reg.user.id);

  for (const size of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1, isMobile: size.w < 500, hasTouch: size.w < 500 });
    for (const route of ['setting', 'moments', 'profile&id=' + reg.user.id, 'scan&code=deadbeef']) {
      const key = route.split('&')[0];
      await page.goto(BASE + '/index.php?' + route, { waitUntil: 'domcontentloaded' });
      await new Promise((r) => setTimeout(r, 1500));
      const a = await page.evaluate(AUDIT);
      console.log(size.w + ' ' + key + ':', JSON.stringify(a));
      check(size.w + ' ' + key + '：区块没有被甩出 .page-body', a.missing !== true && a.stray.length === 0, JSON.stringify(a.hostKids));
      if (a.missing === true) {
        continue;
      }
      check(size.w + ' ' + key + '：.page-body 铺满可用高度', a.client >= size.h * 0.7, 'client=' + a.client);
      check(size.w + ' ' + key + '：纵向可滚动且能滚到底', a.canScroll === false || (a.scrollTopWorks === true && a.lastVisible === true),
        'canScroll=' + a.canScroll + ' scrolled=' + a.scrollTopWorks + ' lastBottom=' + a.lastBottom + ' bodyBottom=' + a.bodyBottom);
      check(size.w + ' ' + key + '：能滚回顶部', a.scrollBackWorks === true);
      check(size.w + ' ' + key + '：页面上没有 NaN（字符串拼接打错的直接痕迹）', a.nan === false);
    }
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
