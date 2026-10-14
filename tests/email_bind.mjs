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
const NAME = 'eb' + ROUND;
const ids = [];
const results = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

async function api(page, path, body) {
  return page.evaluate(async (p, b) => (await (await fetch(p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })).json()), path, body);
}

(async () => {
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('页面异常: ' + e.message));
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });

  const e1 = NAME + '@parlz.com';
  const e2 = 'b2.' + ROUND + '@parlz.com';
  const e3 = 'b3.' + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', e1, CODE, 'register']);
  const reg = await api(page, '/api/auth.php', { action: 'register', username: NAME, nickname: '绑定测试', password: 'parlz-eb-2026', email: e1, code: CODE });
  if (!reg.ok) {
    throw new Error('注册失败 ' + JSON.stringify(reg));
  }
  const uid = reg.user.id;
  ids.push(uid);
  check('注册后账号带邮箱', String(reg.user.email ?? '') === e1 || php(['dbval.php', 'user_email', NAME]) === e1, php(['dbval.php', 'user_email', NAME]));

  php(['dbval.php', 'set_email', String(uid), '']);
  check('模拟老账号：清空邮箱', php(['dbval.php', 'user_email', NAME]) === '', php(['dbval.php', 'user_email', NAME]));

  const anonCtx = await browser.createBrowserContext();
  const anon = await anonCtx.newPage();
  await anon.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const noLogin = await api(anon, '/api/email.php', { action: 'send', email: e2, purpose: 'bind' });
  check('没登录不能申请绑定邮箱的验证码', noLogin.ok !== true && String(noLogin.error).includes('登录'), JSON.stringify(noLogin).slice(0, 120));

  const wrongWay = await api(page, '/api/email.php', { action: 'send', email: e2, purpose: 'rebind' });
  check('没绑过邮箱的账号申请"换绑"被拒', wrongWay.ok !== true && String(wrongWay.error).includes('还没绑定'), JSON.stringify(wrongWay).slice(0, 120));

  php(['dbval.php', 'seed_code', e2, CODE, 'rebind']);
  const rebindCode = await api(page, '/api/profile.php', { action: 'email', email: e2, code: CODE });
  check('未绑定状态下"换绑"用途的验证码不认', rebindCode.ok !== true && String(rebindCode.error).includes('验证码'), JSON.stringify(rebindCode).slice(0, 120));

  php(['dbval.php', 'seed_code', e2, CODE, 'bind']);
  const bound = await api(page, '/api/profile.php', { action: 'email', email: e2, code: CODE });
  check('绑定用途的验证码能完成绑定', bound.ok === true && bound.user.email === e2, JSON.stringify(bound).slice(0, 140));
  check('绑定后数据库里确实写入了邮箱', php(['dbval.php', 'user_email', NAME]) === e2, php(['dbval.php', 'user_email', NAME]));

  const again = await api(page, '/api/email.php', { action: 'send', email: e3, purpose: 'bind' });
  check('已绑定的账号再申请"绑定"被拒', again.ok !== true && String(again.error).includes('已经绑定'), JSON.stringify(again).slice(0, 120));

  php(['dbval.php', 'seed_code', e3, CODE, 'bind']);
  const bindAfter = await api(page, '/api/profile.php', { action: 'email', email: e3, code: CODE });
  check('已换绑状态下"绑定"用途的验证码不认', bindAfter.ok !== true && String(bindAfter.error).includes('验证码'), JSON.stringify(bindAfter).slice(0, 120));
  php(['dbval.php', 'seed_code', e3, CODE, 'rebind']);
  const swapped = await api(page, '/api/profile.php', { action: 'email', email: e3, code: CODE });
  check('换绑用途的验证码能完成换绑', swapped.ok === true && swapped.user.email === e3, JSON.stringify(swapped).slice(0, 140));

  await page.goto(BASE + '/index.php?setting', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1700));
  await page.click('#open-email');
  await new Promise((r) => setTimeout(r, 900));
  const hasMail = await page.evaluate(() => ({
    title: document.querySelector('#drawer-title').textContent.trim(),
    save: document.querySelector('#new-email-save') === null ? '' : document.querySelector('#new-email-save').textContent.trim(),
    field: document.querySelector('#new-email') === null ? '' : String(document.querySelector('#new-email').getAttribute('placeholder')),
  }));
  check('有邮箱时抽屉写"换绑邮箱"', hasMail.title === '换绑邮箱' && hasMail.save === '保存', JSON.stringify(hasMail));
  await page.keyboard.press('Escape');

  php(['dbval.php', 'set_email', String(uid), '']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1700));
  const row = await page.evaluate(() => {
    const n = document.querySelector('#my-email');
    const btn = document.querySelector('#open-email');
    return { desc: n === null ? '' : n.textContent.trim(), btn: btn === null ? '' : btn.textContent.trim() };
  });
  check('没邮箱时那一行显示"还没绑定邮箱"+ 按钮写绑定', row.desc === '还没绑定邮箱' && row.btn === '绑定', JSON.stringify(row));
  await page.click('#open-email');
  await new Promise((r) => setTimeout(r, 900));
  const noMail = await page.evaluate(() => ({
    title: document.querySelector('#drawer-title').textContent.trim(),
    save: document.querySelector('#new-email-save') === null ? '' : document.querySelector('#new-email-save').textContent.trim(),
    field: document.querySelector('#new-email') === null ? '' : String(document.querySelector('#new-email').getAttribute('placeholder')),
  }));
  check('没邮箱时抽屉写"绑定邮箱"', noMail.title === '绑定邮箱' && noMail.save === '绑定' && noMail.field.includes('找回密码'), JSON.stringify(noMail));
  await page.screenshot({ path: 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit/email-bind-drawer.png' });

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
