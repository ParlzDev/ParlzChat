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
  results.push({ name, ok: ok === true, detail: detail === undefined ? '' : String(detail) });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function account(browser, tag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1180, height: 800 });
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'pzl.' + tag + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
    const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-pz-2026', email: e, code: c });
    return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
  }, 'pzl_' + tag + ROUND, email, CODE);
  if (typeof id !== 'number') {
    throw new Error(tag + ' 注册失败 ' + id);
  }
  ids.push(id);
  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  return { page, id, tag };
}

async function api(page, path, body) {
  return page.evaluate(async (p, b) => (await (await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json()), path, body);
}

async function toastText(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#toast-wrap *')).map((n) => n.textContent).join('|').slice(0, 160));
}

async function clickBubbleLink(page, text) {
  return page.evaluate(async (body) => {
    window.__pz_sentinel = 'keep';
    const { renderBody } = await import('/assets/scripts/richtext.js');
    const host = document.createElement('div');
    host.className = 'bubble';
    host.innerHTML = renderBody(body);
    document.body.appendChild(host);
    const anchor = host.querySelector('a');
    const href = anchor === null ? '' : anchor.getAttribute('href');
    const label = anchor === null ? '' : String(anchor.textContent ?? '');
    const target = anchor === null ? '' : String(anchor.getAttribute('target'));
    if (anchor !== null) {
      anchor.click();
    }
    await new Promise((r) => setTimeout(r, 1500));
    const out = {
      href,
      label,
      target,
      anchors: Array.from(host.querySelectorAll('a')).length,
      plainText: String(host.textContent ?? ''),
      scan: document.querySelector('.scan-layer') !== null,
      frameSrc: document.querySelector('.embed-layer .embed-frame') === null ? '' : String(document.querySelector('.embed-layer .embed-frame').src),
      embedLayer: document.querySelector('.embed-layer') !== null,
      riskCard: Array.from(document.querySelectorAll('.embed-card .section-title')).map((n) => n.textContent).join('|'),
      sent: window.__pz_sentinel === 'keep',
      url: location.href,
      hasPzInUrl: location.search.indexOf('pz=') !== -1,
    };
    const close = document.querySelector('.scan-close');
    if (close !== null) {
      close.click();
    }
    document.querySelectorAll('.embed-close').forEach((n) => n.click());
    host.remove();
    return out;
  }, text);
}

(async () => {
  php(['clear_rate.php']);
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const leftover = php(['dbval.php', 'ids_like', 'pzl_']);
  if (leftover !== '') {
    php(['cleanup_test_accounts.php', ...leftover.split(' ')]);
  }
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'],
  });
  const A = await account(browser, 'a');
  const B = await account(browser, 'b');
  const bcode = 'U' + String(B.id).padStart(5, '0');

  const addLink = await clickBubbleLink(A.page, '加群 pz:AddA?code=A00276。乱写 pz:Bogus?x=1');
  const wantHref = 'http://127.0.0.1:8461/index.php?pz=' + encodeURIComponent('pz:AddA?code=A00276');
  check('pz 只渲染成一条链接（未知命令不算）', addLink.anchors === 1, 'anchors=' + addLink.anchors);
  check('链接 href 是 https 形式', addLink.href === wantHref, 'href=' + addLink.href);
  check('链接文字就是这条 https 地址', addLink.label === wantHref, 'label=' + addLink.label);
  check('链接不带 target=_blank', addLink.target === 'null', 'target=' + addLink.target);
  check('中文句号没被吞进链接', addLink.plainText.indexOf('A00276。乱写') !== -1, 'text=' + addLink.plainText.slice(0, 90));

  const scanClick = await clickBubbleLink(A.page, '打开扫一扫 pz:Scan');
  check('点 pz:Scan 页内执行', scanClick.scan === true, 'href=' + scanClick.href);
  check('点了不跳页面（哨兵还在）', scanClick.sent === true && scanClick.hasPzInUrl === false, 'url=' + scanClick.url);

  const profileClick = await clickBubbleLink(A.page, '看资料 pz:Profile?code=' + bcode);
  check('点 pz:Profile 跳资料页', profileClick.sent && (await A.page.evaluate(() => location.search.indexOf('profile') !== -1 || document.querySelector('#page') !== null)),
    'url=' + await A.page.evaluate(() => location.href));
  await A.page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  const external = await clickBubbleLink(A.page, 'https://example.com/index.php?pz=' + encodeURIComponent('pz:Scan'));
  check('外站带 pz 参数不当本站命令执行', external.scan === false, 'scan=' + external.scan);
  check('外站链接仍走原提示', external.embedLayer === true, 'risk=' + external.riskCard);

  const made = await api(B.page, '/api/auth.php', { action: 'scan-create' });
  const authPosts = [];
  A.page.on('request', (r) => {
    if (r.url().indexOf('/api/auth.php') !== -1 && r.method() === 'POST') {
      authPosts.push(String(r.postData() ?? ''));
    }
  });
  const loginClick = await clickBubbleLink(A.page, '帮我登录 pz:login?code=' + made.code);
  check('点 pz:login 出确认框而不是直接确认', loginClick.frameSrc.indexOf('embed.php?scan=' + made.code) !== -1, 'frame=' + loginClick.frameSrc);
  check('没有偷发 scan-confirm', authPosts.every((p) => p.indexOf('scan-confirm') === -1), 'posts=' + authPosts.length);
  const poll = await api(B.page, '/api/auth.php', { action: 'scan-poll', code: made.code });
  check('登录码仍是待确认', poll.status === 'pending', JSON.stringify(poll).slice(0, 90));

  const badLogin = await clickBubbleLink(A.page, '坏码 pz:login?code=zzzz');
  check('坏登录码点击有提示', (await toastText(A.page)).indexOf('登录码不对') !== -1, 'toast=' + await toastText(A.page));

  await api(A.page, '/api/friends.php', { action: 'quick-add', user_id: B.id });
  const opened = await api(A.page, '/api/chats.php', { action: 'open', user_id: B.id });
  await api(A.page, '/api/messages.php', { action: 'send', chat_id: opened.chat_id, kind: 'text', body: '真消息 pz:Scan 点它' });
  await A.page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  await A.page.evaluate(async (id) => {
    const { emit } = await import('/assets/scripts/state.js');
    emit('open-chat', id);
  }, opened.chat_id);
  await sleep(1500);
  const real = await A.page.evaluate(async () => {
    window.__pz_sentinel = 'keep';
    const bubble = Array.from(document.querySelectorAll('.msg-mine .bubble')).find((n) => n.textContent.indexOf('真消息') !== -1);
    if (bubble === undefined) {
      return { found: false };
    }
    const anchor = bubble.querySelector('a');
    const href = anchor === null ? '' : String(anchor.getAttribute('href'));
    if (anchor !== null) {
      anchor.click();
    }
    await new Promise((r) => setTimeout(r, 1500));
    const out = {
      found: true,
      href,
      text: anchor === null ? '' : String(anchor.textContent ?? ''),
      scan: document.querySelector('.scan-layer') !== null,
      sent: window.__pz_sentinel === 'keep',
      url: location.href,
    };
    const close = document.querySelector('.scan-close');
    if (close !== null) {
      close.click();
    }
    return out;
  });
  check('真发出去的消息里 pz 也成 https 链接', real.found === true && real.href === 'http://127.0.0.1:8461/index.php?pz=pz%3AScan',
    'href=' + real.href);
  check('真消息里的链接点了页内执行且不跳页', real.scan === true && real.sent === true, 'url=' + real.url);

  await browser.close();
  console.log('清理:', php(['cleanup_test_accounts.php', ...ids.map(String)]));
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length === 0 ? 'pz 链接判据全部通过' : '失败: ' + bad.map((f) => f.name).join('、'));
  process.exit(bad.length === 0 ? 0 : 1);
})();
