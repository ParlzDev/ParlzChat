import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PHP = 'C:\\tools\\php85\\php.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\tests\\';
const ROUND = Date.now().toString().slice(-6);
const CODE = '246810';
const ids = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

(async () => {
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'av.' + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
    const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-av-2026', email: e, code: c });
    return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
  }, 'av_' + ROUND, email, CODE);
  if (typeof id !== 'number') {
    throw new Error('注册失败 ' + id);
  }
  ids.push(id);
  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1600));

  const noAvatar = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('action', 'avatar');
    form.append('avatar', new File([bytes], 'a.png', { type: 'image/png' }));
    const r = await fetch('/api/profile.php', { method: 'POST', body: form, credentials: 'same-origin' });
    return (await r.json());
  }, readFileSync('C:/Users/JGZ_YES/AppData/Local/Temp/parlz_avatar.png').toString('base64'));
  console.log('上传头像:', JSON.stringify(noAvatar).slice(0, 160));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1800));

  const probe = await page.evaluate(() => {
    const box = (n) => {
      if (n === null || n === undefined) {
        return null;
      }
      const r = n.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const cs = (n, keys) => {
      if (n === null || n === undefined) {
        return null;
      }
      const style = getComputedStyle(n);
      const out = {};
      keys.forEach((k) => { out[k] = style[k]; });
      return out;
    };
    const rail = document.querySelector('.rail');
    const avatar = document.querySelector('.rail-avatar');
    const face = document.querySelector('.rail-avatar .rail-face');
    const img = document.querySelector('.rail-avatar .rail-face img') ?? document.querySelector('.rail-avatar img');
    const on = document.querySelector('.rail-avatar .avatar-on');
    const pill = document.querySelector('.rail-pill');
    return {
      html: avatar === null ? 'missing' : avatar.outerHTML.slice(0, 320),
      railBox: box(rail),
      railStyle: cs(rail, ['height', 'padding', 'overflow', 'alignItems']),
      avatarBox: box(avatar),
      avatarStyle: cs(avatar, ['width', 'height', 'borderRadius', 'overflow', 'display', 'flexDirection', 'gap']),
      faceBox: box(face),
      faceStyle: cs(face, ['display', 'width', 'height', 'borderRadius', 'overflow', 'borderWidth', 'background']),
      imgBox: box(img),
      imgStyle: cs(img, ['width', 'height', 'borderRadius', 'objectFit', 'display']),
      onBox: box(on),
      onStyle: cs(on, ['width', 'height', 'right', 'bottom', 'background', 'position', 'borderRadius']),
      skin: avatar === null ? null : avatar.dataset.skin,
      hasStatus: (() => { const d = document.querySelector(".rail-avatar .avatar-on"); return d === null ? null : d.hasAttribute("data-status"); })(),
      matchesRule: (() => { const d = document.querySelector(".rail-avatar .avatar-on"); return d === null ? null : d.matches(".rail-avatar[data-skin=\"0\"] .avatar-on:not([data-status])"); })(),
      dotBg: (() => { const d = document.querySelector(".rail-avatar .avatar-on"); return d === null ? null : getComputedStyle(d).backgroundColor; })(),
      faceBg: (() => { const f = document.querySelector(".rail-avatar .rail-face"); return f === null ? null : getComputedStyle(f).backgroundColor; })(),
      pillBox: box(pill),
      pillStyle: cs(pill, ['top', 'width', 'height', 'background', 'transform']),
    };
  });
  console.log('头像探针:', JSON.stringify(probe, null, 1));
  const target = await page.$('.rail-avatar');
  if (target !== null) {
    await target.screenshot({ path: 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit/avatar-before.png' });
  }
  await browser.close();
  console.log('清理:', php(['cleanup_test_accounts.php', ...ids.map(String)]));
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
