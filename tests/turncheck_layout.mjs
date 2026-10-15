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
const W = Number(process.env.PARLZ_W ?? 360);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
php(['clear_rate.php']);
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: W, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
const email = 'tlay.' + ROUND + '@parlz.com';
php(['dbval.php', 'seed_code', email, CODE, 'register']);
const id = await page.evaluate(async (u, e, c) => {
  const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
  const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-pz-2026', email: e, code: c });
  return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
}, 'tlay_' + ROUND, email, CODE);
await page.goto(BASE + '/index.php?setting', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.page-body', { timeout: 20000 }).catch(() => {});
await wait(1600);
await mkdirSync(OUT, { recursive: true });

const squeezed = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('.setting-row').forEach((row) => {
    const kids = Array.from(row.children);
    const tail = kids[kids.length - 1];
    if (kids.length < 2 || tail === null) {
      return;
    }
    if (!tail.classList.contains('btn') && !tail.classList.contains('segmented') && tail.querySelector('.segmented') === null) {
      return;
    }
    const r = tail.getBoundingClientRect();
    if (r.height > r.width * 1.4) {
      bad.push({ text: String(row.textContent ?? '').slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) });
    }
  });
  return bad;
});
check('设置行尾控件没被压成竖条', squeezed.length === 0, JSON.stringify(squeezed).slice(0, 160));

const overflow = await page.evaluate(() => {
  const pane = document.querySelector('.page-body');
  return pane === null ? { bad: true, x: 0 } : { bad: pane.scrollWidth > pane.clientWidth + 1, x: pane.scrollWidth - pane.clientWidth, pad: getComputedStyle(pane).paddingBottom };
});
check('设置页不横向溢出', overflow.bad !== true, 'delta=' + overflow.x + ' padBottom=' + overflow.pad);
check('内容底部预留了底栏高度', String(overflow.pad).indexOf('84px') === 0, 'padBottom=' + overflow.pad);

const covered = await page.evaluate(() => {
  const pane = document.querySelector('.page-body');
  const rail = document.querySelector('.rail');
  if (pane === null || rail === null) {
    return { bad: true };
  }
  pane.scrollTop = pane.scrollHeight;
  const blocks = Array.from(document.querySelectorAll('.page-body .setting-block, .page-body .profile-card'));
  const last = blocks[blocks.length - 1];
  const railTop = rail.getBoundingClientRect().top;
  return { bad: last.getBoundingClientRect().bottom > railTop + 1, lastBottom: Math.round(last.getBoundingClientRect().bottom), railTop: Math.round(railTop) };
});
check('滚到底后最后一块不被底栏压住', covered.bad !== true, 'lastBottom=' + covered.lastBottom + ' railTop=' + covered.railTop);

await page.evaluate(() => {
  document.querySelector('.page-body').scrollTop = 0;
});
await wait(300);
const btn = await page.evaluate(() => {
  const b = document.querySelector('#call-check');
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await wait(300);
await page.mouse.click(btn.x, btn.y);
await wait(16000);
const after = await page.evaluate(() => {
  const out = document.querySelector('#call-check-result');
  const block = out === null ? null : out.closest('.setting-block');
  const detail = document.querySelector('#call-check-detail');
  const toggle = document.querySelector('[data-act="st-check-toggle"]');
  const pane = document.querySelector('.page-body');
  const vh = window.innerHeight;
  const mid = document.elementFromPoint(20, Math.round(vh / 2));
  return {
    blockH: block === null ? 0 : Math.round(block.getBoundingClientRect().height),
    resultH: out === null ? 0 : Math.round(out.getBoundingClientRect().height),
    verdict: String(document.querySelector('.check-verdict')?.textContent ?? ''),
    counts: String(document.querySelector('#call-check-result .mono')?.textContent ?? ''),
    hidden: detail === null ? null : detail.hidden,
    hasToggle: toggle !== null,
    toggleLabel: toggle === null ? '' : String(toggle.textContent),
    paneScrollH: pane === null ? 0 : Math.round(pane.scrollHeight - pane.clientHeight),
    centerInside: mid !== null && mid.closest('.page-body') !== null,
    text: String(out?.textContent ?? '').slice(0, 120),
  };
});
check('检测结果面板不再占满整屏', after.resultH < 200, 'resultH=' + after.resultH + ' blockH=' + after.blockH);
check('结果里有结论行与计数', after.verdict.indexOf('中继') === 0 && after.counts.indexOf('host') === 0, after.verdict + ' | ' + after.counts);
check('明细默认收起', after.hasToggle === true && after.hidden === true, 'toggle=' + after.toggleLabel);
check('设置页中部没有被浮层盖住', after.centerInside === true);
await page.screenshot({ path: OUT + '/w' + W + '-fixed.png' });

const opened = await page.evaluate(async () => {
  const toggle = document.querySelector('[data-act="st-check-toggle"]');
  toggle.click();
  await new Promise((r) => setTimeout(r, 300));
  const detail = document.querySelector('#call-check-detail');
  return { hidden: detail.hidden, text: String(detail.textContent ?? '').slice(0, 60) };
});
check('点开明细能看到候选', opened.hidden === false && opened.text.length > 6, opened.text);
await printBottom();

async function printBottom() {
  const shot = await page.evaluate(() => {
    const toggle = document.querySelector('[data-act="st-check-toggle"]');
    toggle.scrollIntoView({ block: 'center' });
    return true;
  });
  await wait(400);
  await page.screenshot({ path: OUT + '/w' + W + '-detail.png' });
  console.log('detail shot=' + shot);
}

console.log('清理:', php(['cleanup_test_accounts.php', String(id)]));
await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(bad.length === 0 ? '设置页手机端判据全部通过（宽 ' + W + '）' : '失败: ' + bad.map((f) => f.name).join('、'));
process.exit(bad.length === 0 ? 0 : 1);
