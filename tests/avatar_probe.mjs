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

const PROBE = () => {
  const box = (n) => {
    if (n === null || n === undefined) {
      return null;
    }
    const r = n.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const root = getComputedStyle(document.documentElement);
  const canvasCtx = document.createElement('canvas').getContext('2d');
  const paint = (value) => {
    canvasCtx.fillStyle = '#000000';
    canvasCtx.fillStyle = String(value);
    const hex = canvasCtx.fillStyle;
    const rgb = hex.match(/^#(..)(..)(..)$/);
    if (rgb === null) {
      return hex;
    }
    return 'rgb(' + parseInt(rgb[1], 16) + ', ' + parseInt(rgb[2], 16) + ', ' + parseInt(rgb[3], 16) + ')';
  };
  const greenPx = paint(root.getPropertyValue('--green').trim());
  const onGreenPx = paint(root.getPropertyValue('--on-green').trim());
  const read = (sel) => {
    const avatar = document.querySelector(sel);
    if (avatar === null) {
      return { missing: true, sel };
    }
    const face = avatar.querySelector('.rail-face') ?? avatar;
    const dot = avatar.querySelector(':scope > .avatar-on, .rail-face > .avatar-on');
    const img = avatar.querySelector('img');
    const clips = [avatar, face].map((n) => getComputedStyle(n).overflow);
    return {
      sel,
      skin: avatar.dataset.skin ?? null,
      isPhoto: avatar.classList.contains('is-photo'),
      hasImg: img !== null,
      hostBox: box(avatar),
      faceBox: box(face),
      dotBox: box(dot),
      dotBg: dot === null ? null : getComputedStyle(dot).backgroundColor,
      dotRing: dot === null ? null : getComputedStyle(dot).borderTopColor,
      dotClip: clips.includes('hidden'),
      clips,
      imgClip: img === null ? null : getComputedStyle(img).clipPath,
      greenPx,
      onGreenPx,
    };
  };
  return {
    rail: read('.rail-avatar'),
    profile: read('.profile-top .avatar'),
    msg: read('.msg .avatar'),
    diag: {
      chatItems: document.querySelectorAll('[data-chat]').length,
      msgs: document.querySelectorAll('.msg').length,
      body: document.querySelector('#chat-body') === null ? 'no-body' : document.querySelector('#chat-body').className + '|' + document.querySelector('#chat-body').textContent.trim().slice(0, 40),
    },
  };
};

function judge(label, r, wantDot) {
  check(label + '：头像存在', r.missing !== true, JSON.stringify(r));
  if (r.missing === true) {
    return;
  }
  check(label + '：头像照片按圆裁', r.imgClip === null || r.imgClip.indexOf('circle') === 0, String(r.imgClip));
  check(label + '：有照片的头像带 is-photo', r.isPhoto === r.hasImg, 'isPhoto=' + r.isPhoto + ' hasImg=' + r.hasImg);
  if (!wantDot) {
    return;
  }
  check(label + '：在线点在头像上', r.dotBox !== null && r.dotBox.w > 0, JSON.stringify(r.dotBox));
  if (r.dotBox === null || r.faceBox === null) {
    return;
  }
  const ratio = r.dotBox.w / r.faceBox.w;
  check(label + '：在线点不超过头像 30%', ratio <= 0.3, 'dot ' + JSON.stringify(r.dotBox) + ' face ' + JSON.stringify(r.faceBox) + ' = ' + ratio.toFixed(3));
  check(label + '：在线点没有被圆形容器裁掉', r.dotClip === false, JSON.stringify(r.clips));
  if (r.isPhoto) {
    check(label + '：有照片时在线点是绿色', r.dotBg === r.greenPx, r.dotBg + ' green=' + r.greenPx + ' onGreen=' + r.onGreenPx);
  } else if (r.skin === '0') {
    check(label + '：绿底文字头像的在线点不是绿压绿', r.dotBg === r.onGreenPx, r.dotBg + ' onGreen=' + r.onGreenPx);
  }
}

const hexOf = (rgb) => '#' + String(rgb).match(/\d+/g).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();

async function dotPixel(page, r, file, expectRgb, label) {
  const handle = await page.$(r.sel);
  if (handle === null || r.dotBox === null || r.hostBox === null) {
    check(label + '：截到在线点像素', false, JSON.stringify(r.dotBox));
    return;
  }
  await handle.screenshot({ path: OUT + '/' + file });
  const cx = Math.round((r.dotBox.x + r.dotBox.w / 2 - r.hostBox.x) * 3);
  const cy = Math.round((r.dotBox.y + r.dotBox.h / 2 - r.hostBox.y) * 3);
  const out = php(['pixel_modal.php', OUT + '/' + file, String(cx), String(cy), '4']);
  check(label + '：在线点实际画出来是 ' + hexOf(expectRgb), out.trim().split(' ')[0] === hexOf(expectRgb).slice(1), out.trim() + ' expect ' + hexOf(expectRgb));
}

async function register(page, name) {
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const email = name + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
    const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-av-2026', email: e, code: c });
    return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
  }, name, email, CODE);
  if (typeof id !== 'number') {
    throw new Error(name + ' 注册失败 ' + id);
  }
  ids.push(id);
  return id;
}

(async () => {
  php(['make_png.php', OUT + '/probe-avatar.png']);
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('页面异常: ' + e.message));
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });

  let uid = 0;
  for (let attempt = 0; attempt < 8 && uid === 0; attempt += 1) {
    const id = await register(page, 'av' + ROUND + '_' + attempt);
    if (id % 4 === 0) {
      uid = id;
    }
  }
  check('造出一个 skin=0 的测试账号', uid !== 0, 'ids=' + ids.join(','));

  const peerCtx = await browser.createBrowserContext();
  const peer = await peerCtx.newPage();
  await peer.setCacheEnabled(false);
  await peer.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await peer.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const pid = await register(peer, 'peer' + ROUND);

  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1600));
  const plain = await page.evaluate(PROBE);
  judge('无照片·导航', plain.rail, true);
  await dotPixel(page, plain.rail, 'avatar-initials-dot.png', plain.rail.skin === '0' ? plain.rail.onGreenPx : plain.rail.greenPx, '无照片·导航');

  const up = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('action', 'avatar');
    form.append('avatar', new File([bytes], 'a.png', { type: 'image/png' }));
    const r = await fetch('/api/profile.php', { method: 'POST', body: form, credentials: 'same-origin' });
    return (await r.json());
  }, readFileSync(OUT + '/probe-avatar.png').toString('base64'));
  console.log('上传头像:', JSON.stringify(up).slice(0, 140));

  const face = await page.evaluate(async () => (await (await fetch('/api/friends.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'face-code' }) })).json()));
  const joined = await peer.evaluate(async (c) => (await (await fetch('/api/friends.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'face-join', code: c }) })).json()), face.code);
  console.log('加好友:', JSON.stringify(face).slice(0, 80), JSON.stringify(joined).slice(0, 120));
  const dm = await peer.evaluate(async (id) => (await (await fetch('/api/chats.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open', user_id: id }) })).json()), uid);
  console.log('DM:', JSON.stringify(dm).slice(0, 200));
  await page.evaluate(async (chatId) => (await (await fetch('/api/messages.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', chat_id: chatId, kind: 'text', body: '头像探针' }) })).json()), dm.chat_id ?? dm.chat?.id);

  await page.goto(BASE + '/index.php?setting', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  const setting = await page.evaluate(PROBE);
  judge('有照片·设置页大头像', setting.profile, true);

  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1600));
  const list = await page.evaluate(PROBE);
  console.log('诊断·会话列表:', JSON.stringify(list.diag));
  judge('有照片·导航', list.rail, true);
  await dotPixel(page, list.rail, 'avatar-photo-dot.png', list.rail.greenPx, '有照片·导航');
  const stale = await page.evaluate(() => {
    document.querySelector('.rail-avatar').classList.remove('is-photo');
    const dot = document.querySelector('.rail-avatar .avatar-on');
    return dot === null ? null : getComputedStyle(dot).backgroundColor;
  });
  check('旧 JS（没有 is-photo）时照片头像的在线点仍是绿色', stale === list.rail.greenPx, String(stale) + ' vs ' + list.rail.greenPx);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1200));

  const chatId = dm.chat_id ?? (dm.chat ? dm.chat.id : 0);
  try {
    await page.waitForSelector('[data-chat="' + chatId + '"]', { timeout: 6000 });
    await page.click('[data-chat="' + chatId + '"]');
    await page.waitForSelector('.msg .avatar', { timeout: 6000 });
  } catch (error) {
    console.log('打开会话失败: ' + error.message);
  }
  await new Promise((r) => setTimeout(r, 1200));
  const after = await page.evaluate(PROBE);
  console.log('诊断·聊天内:', JSON.stringify(after.diag));
  judge('有照片·消息行', after.msg, false);
  const shotC = await page.$('.msg:last-child');
  if (shotC !== null) {
    await shotC.screenshot({ path: OUT + '/avatar-msg-row.png' });
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
