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
const results = [];
const ids = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

php(['clear_rate.php']);
const leftover = php(['dbval.php', 'ids_like', 'anm_']);
if (leftover !== '') {
  php(['cleanup_test_accounts.php', ...leftover.split(' ')]);
}
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  mkdirSync(OUT, { recursive: true });
const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 860 });
await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
const email = 'anm.' + ROUND + '@parlz.com';
php(['dbval.php', 'seed_code', email, CODE, 'register']);
const id = await page.evaluate(async (u, e) => {
  const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
  const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-pz-2026', email: e, code: '246810' });
  return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
}, 'anm_' + ROUND, email);
ids.push(id);
await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.chat-list', { timeout: 15000 }).catch(() => {});
await wait(1500);

const shape = await page.evaluate(async () => {
  const mod = await import('/assets/scripts/stickers.js');
  const names = mod.stickerNames();
  const animated = mod.animatedStickerNames();
  const statics = mod.staticStickerNames();
  const report = { total: names.length, animated: animated.length, broken: [], staticBroken: [] };
  const probe = (name) => {
    const host = document.createElement('div');
    host.innerHTML = mod.stickerSvg(name);
    const svg = host.querySelector('svg');
    if (svg === null) {
      return 'no-svg';
    }
    const shapes = svg.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon').length;
    const anim = svg.querySelectorAll('animate, animateTransform, animateMotion').length;
    return { shapes, anim };
  };
  animated.forEach((name) => {
    const info = probe(name);
    if (typeof info === 'string' || info.shapes < 1 || info.anim < 1) {
      report.broken.push(name + ':' + JSON.stringify(info));
    }
  });
  statics.forEach((name) => {
    const info = probe(name);
    if (typeof info === 'string' || info.shapes < 1) {
      report.staticBroken.push(name + ':' + JSON.stringify(info));
    }
    if (typeof info !== 'string' && info.anim > 0) {
      report.broken.push('static-but-animated:' + name);
    }
  });
  return report;
});
check('表情总数增加且分组正确', shape.total === 37 && shape.animated === 7, JSON.stringify({ total: shape.total, animated: shape.animated }));
check('动态表情都带 SMIL 动画并且能画出形状', shape.broken.length === 0, JSON.stringify(shape.broken));
check('静态表情都没混进动画', shape.staticBroken.length === 0 && shape.broken.indexOf('static-but-animated') === -1, JSON.stringify(shape.staticBroken));

const motion = await page.evaluate(async () => {
  const mod = await import('/assets/scripts/stickers.js');
  const box = document.createElement('div');
  box.className = 'sticker-bubble';
  box.style.position = 'fixed';
  box.style.left = '20px';
  box.style.top = '20px';
  box.style.width = '64px';
  box.style.height = '64px';
  box.innerHTML = mod.stickerSvg('twinkle') + mod.stickerSvg('smile') + mod.stickerSvg('note');
  document.body.appendChild(box);
  const svgs = box.querySelectorAll('svg');
  const target = (svg) => svg.querySelector('path, g > g');
  const sample = (node) => {
    const r = node.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100).join('/');
  };
  const spin1 = sample(target(svgs[0]));
  const smile1 = sample(svgs[1].querySelector('circle'));
  const note1 = sample(target(svgs[2]));
  await new Promise((r) => setTimeout(r, 1150));
  const spin2 = sample(target(svgs[0]));
  const smile2 = sample(svgs[1].querySelector('circle'));
  const note2 = sample(target(svgs[2]));
  const animCount = box.querySelectorAll('animate, animateTransform').length;
  box.remove();
  return { spin1, spin2, smile1, smile2, note1, note2, animCount };
});
check('闪亮真的在闪（尺寸随时间变化）', motion.spin1 !== motion.spin2, motion.spin1 + ' → ' + motion.spin2);
check('音符真的在跳（位置随时间变化）', motion.note1 !== motion.note2, motion.note1 + ' → ' + motion.note2);
check('静态表情纹丝不动', motion.smile1 === motion.smile2, motion.smile1 + ' → ' + motion.smile2);
check('动画元素真的进了 DOM', motion.animCount >= 3, 'anim=' + motion.animCount);

const panel = await page.evaluate(async () => {
  const info = await import('/assets/scripts/stickers.js');
  document.querySelector('#emoji-btn').click();
  await new Promise((r) => setTimeout(r, 300));
  const host = document.querySelector('#sticker-panel');
  const heads = Array.from(host.querySelectorAll('.sticker-head')).map((n) => n.textContent);
  const animatedItems = host.querySelectorAll('[data-sticker="beat"], [data-sticker="twinkle"], [data-sticker="blaze"], [data-sticker="sunny"], [data-sticker="rainy"], [data-sticker="note"], [data-sticker="candle"]');
  const animInPanel = host.querySelectorAll('.sticker-item svg animate, .sticker-item svg animateTransform').length;
  const item = host.querySelector('[data-sticker="beat"]');
  item.click();
  await new Promise((r) => setTimeout(r, 200));
  const input = document.querySelector('#composer-input');
  const token = String(input.value);
  const animatedOk = info.animatedStickerNames().length;
  document.querySelector('#emoji-btn').click();
  return { heads, animatedItems: animatedItems.length, animInPanel, token, animatedOk };
});
check('面板里有「动态表情」分组', panel.heads.indexOf('动态表情') !== -1 && panel.heads.indexOf('默认表情') !== -1, JSON.stringify(panel.heads));
check('面板里 7 个动态表情都在', panel.animatedItems === 7 && panel.animatedOk === 7, JSON.stringify({ items: panel.animatedItems, exported: panel.animatedOk }));
check('面板里的动态表情在跑动画', panel.animInPanel >= 10, 'anim=' + panel.animInPanel);
check('点动态表情插入的是自己的标签', panel.token === '[心跳]', 'token=' + panel.token);

const bubble = await page.evaluate(async (round) => {
  const opened = await (await fetch('/api/chats.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'self-chat' }) })).json();
  const chats = await (await fetch('/api/chats.php', { credentials: 'same-origin' })).json();
  const self = (chats.chats ?? []).find((c) => c.type === 'self') ?? null;
  if (self === null) {
    return { error: 'no-self-chat', opened: JSON.stringify(opened).slice(0, 60) };
  }
  await fetch('/api/messages.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', chat_id: self.id, kind: 'text', body: '[心跳] 动画' + round }) });
  const { emit } = await import('/assets/scripts/state.js');
  emit('open-chat', self.id);
  await new Promise((r) => setTimeout(r, 1800));
  const bubbles = Array.from(document.querySelectorAll('.msg-mine .bubble'));
  const hit = bubbles.find((n) => n.textContent.indexOf('动画' + round) !== -1) ?? null;
  if (hit === null) {
    return { error: 'no-bubble', bubbles: bubbles.length };
  }
  return {
    inline: hit.querySelectorAll('.sticker-inline svg').length,
    anim: hit.querySelectorAll('.sticker-inline svg animateTransform').length,
    text: String(hit.textContent).slice(0, 24),
  };
}, ROUND);
check('聊天里发出去的动态表情带在跑动画', bubble.error === undefined && bubble.inline === 1 && bubble.anim >= 1, JSON.stringify(bubble));
await page.evaluate(() => {
  document.querySelector('#emoji-btn').click();
});
await wait(500);
await page.screenshot({ path: OUT + '/stickers-panel.png' });

await browser.close();
console.log('清理:', php(['cleanup_test_accounts.php', ...ids.map(String)]));
const bad = results.filter((r) => !r.ok);
console.log(bad.length === 0 ? '动态表情判据全部通过' : '失败: ' + bad.map((f) => f.name).join('、'));
process.exit(bad.length === 0 ? 0 : 1);
