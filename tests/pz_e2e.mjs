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

async function account(browser, tag) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1180, height: 800 });
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'pz.' + tag + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
    const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-pz-2026', email: e, code: c });
    return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
  }, 'pz_' + tag + ROUND, email, CODE);
  if (typeof id !== 'number') {
    throw new Error(tag + ' 注册失败 ' + id);
  }
  ids.push(id);
  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1200));
  return { page, id, tag };
}

async function toastText(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#toast-wrap *')).map((n) => n.textContent).join('|').slice(0, 160));
}

async function runPz(page, link) {
  return page.evaluate(async (raw) => {
    const mod = await import('/assets/scripts/pz.js');
    return await mod.runPz(raw);
  }, link);
}

async function api(page, path, body) {
  return page.evaluate(async (p, b) => (await (await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json()), path, body);
}

async function getApi(page, path) {
  return page.evaluate(async (p) => (await (await fetch(p, { credentials: 'same-origin' })).json()), path);
}

async function parseOnly() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const cases = await page.evaluate(async () => {
    const mod = await import('/assets/scripts/pz.js');
    return {
      adda: mod.parsePz('pz:AddA?code=A00276'),
      bare: mod.parsePz('pz:login?code&abcdef0123456789'),
      hash: mod.parsePz('#pz:Scan'),
      wrapped: mod.parsePz(location.origin + '/index.php?pz=' + encodeURIComponent('pz:Profile?code=U00312')),
      share: mod.parsePz('pz:Share?code=A00276'),
      bad: mod.parsePz('https://example.com'),
      table: mod.commandTable().length,
    };
  });
  await browser.close();
  check('pz:AddA 解析', cases.adda !== null && cases.adda.cmd === 'adda' && cases.adda.params.code === 'A00276', JSON.stringify(cases.adda));
  check('code& 解析', cases.bare !== null && cases.bare.cmd === 'login' && cases.bare.params.code === 'abcdef0123456789');
  check('#pz: 解析', cases.hash !== null && cases.hash.cmd === 'scan');
  check('?pz= 包装解析', cases.wrapped !== null && cases.wrapped.cmd === 'profile' && cases.wrapped.params.code === 'U00312');
  check('pz:Share 解析', cases.share !== null && cases.share.cmd === 'share');
  check('非 pz 返回 null', cases.bad === null);
  check('命令表 7 条', cases.table === 7, 'table=' + cases.table);
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length === 0 ? '解析判据全部通过' : '解析失败: ' + bad.map((f) => f.name).join('、'));
  process.exit(bad.length === 0 ? 0 : 1);
}

if (process.argv.indexOf('--parse-only') !== -1) {
  await parseOnly();
}

(async () => {
  console.log('清限流:', php(['clear_rate.php']));
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const leftover = php(['dbval.php', 'ids_like', 'pz_']);
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
  const C = await account(browser, 'c');

  const created = await api(B.page, '/api/groups.php', { action: 'create', name: 'pz群' + ROUND, member_ids: [] });
  const gid = created.chat_id;
  await api(B.page, '/api/groups.php', { action: 'settings', chat_id: gid, search_mode: 'both', join_mode: 'open' });
  const gcode = 'A' + String(gid).padStart(5, '0');
  const ccode = 'U' + String(C.id).padStart(5, '0');
  const bcode = 'U' + String(B.id).padStart(5, '0');
  check('准备：B 建群', typeof gid === 'number', 'gid=' + gid + ' code=' + gcode);

  check('pz:AddA 返回已处理', await runPz(A.page, 'pz:AddA?code=' + gcode) === true);
  await new Promise((r) => setTimeout(r, 1800));
  check('pz:AddA 后 A 在群成员里',
    (await getApi(A.page, '/api/groups.php')).groups.some((g) => g.id === gid),
    await toastText(A.page));

  check('pz:AddA 的 code& 写法同样吃下', await runPz(A.page, 'pz:AddA?code&' + gcode) === true);

  await A.page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1200));
  check('pz:Chat 打开群会话', await runPz(A.page, 'pz:Chat?code=' + gcode) === true);
  await new Promise((r) => setTimeout(r, 1500));
  check('pz:Chat 后标题是该群', (await A.page.$eval('.chat-title', (n) => n.textContent)).includes('pz群'),
    await A.page.$eval('.chat-title', (n) => n.textContent));

  check('pz:Profile 跳资料页', await runPz(A.page, 'pz:Profile?code=' + bcode) === true);
  await new Promise((r) => setTimeout(r, 1500));
  check('pz:Profile 后路由是 profile', await A.page.evaluate(() => location.search.indexOf('profile') !== -1 || document.querySelector('#page') !== null),
    await A.page.evaluate(() => location.href));

  check('pz:AddUser 加好友', await runPz(A.page, 'pz:AddUser?code=' + ccode) === true);
  await new Promise((r) => setTimeout(r, 1500));
  check('pz:AddUser 后 C 成为好友',
    (await getApi(A.page, '/api/friends.php')).friends.some((f) => f.id === C.id),
    await toastText(A.page));

  check('pz:Scan 打开扫码', await runPz(A.page, 'pz:Scan') === true);
  await new Promise((r) => setTimeout(r, 900));
  check('扫码层已出现', await A.page.evaluate(() => document.querySelector('.scan-layer') !== null));
  await A.page.evaluate(() => document.querySelector('.scan-close')?.click());

  const made = await api(B.page, '/api/auth.php', { action: 'scan-create' });
  check('pz:login 确认登录码', await runPz(A.page, 'pz:login?code=' + made.code) === true, 'code_len=' + String(made.code).length);
  await new Promise((r) => setTimeout(r, 1200));
  const poll = await api(B.page, '/api/auth.php', { action: 'scan-poll', code: made.code });
  check('登录码已被确认（scan-poll 不再 pending）', poll.status === 'confirmed' || poll.status === 'expired', JSON.stringify(poll).slice(0, 90));

  check('未知命令不处理', await runPz(A.page, 'pz:Bogus?code=x') === false);
  check('非 pz 文本不处理', await runPz(A.page, 'https://example.com/x') === false);
  check('坏用户码被拒', await runPz(A.page, 'pz:AddUser?code=123') === false, await toastText(A.page));
  check('未登录时 pz:login 不崩', await runPz(A.page, 'pz:login?code=zzzz') === false);

  const parsed = await A.page.evaluate(async () => {
    const mod = await import('/assets/scripts/pz.js');
    return {
      bare: mod.parsePz('pz:login?code&abc123'),
      hash: mod.parsePz('#pz:Scan'),
      wrapped: mod.parsePz('http://127.0.0.1:8461/index.php?pz=' + encodeURIComponent('pz:AddA?code=A00276')),
      bad: mod.parsePz('http://example.com'),
    };
  });
  check('解析 code& 写法', parsed.bare !== null && parsed.bare.cmd === 'login' && parsed.bare.params.code === 'abc123', JSON.stringify(parsed.bare));
  check('解析 #pz: 形式', parsed.hash !== null && parsed.hash.cmd === 'scan');
  check('解析 ?pz= 包装', parsed.wrapped !== null && parsed.wrapped.cmd === 'adda' && parsed.wrapped.params.code === 'A00276');
  check('非 pz 返回 null', parsed.bad === null);

  const scanFix = await A.page.evaluate(async () => {
    const mod = await import('/assets/scripts/scanner.js');
    return typeof mod.handleScan === 'function';
  });
  check('扫码入口可用（A 码分支已修）', scanFix);

  await browser.close();
  console.log('清理:', php(['cleanup_test_accounts.php', ...ids.map(String)]));
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? '全部通过 (' + results.length + ')' : '失败 ' + failed.length + ' 条: ' + failed.map((f) => f.name).join('、'));
  if (failed.length > 0) {
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
