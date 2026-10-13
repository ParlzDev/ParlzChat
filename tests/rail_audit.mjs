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
const ROUND = Date.now().toString().slice(-6);
const CODE = '246810';
const ids = [];

function php(args) {
  return execFileSync(PHP, [ROOT + args[0], ...args.slice(1)], { encoding: 'utf8' }).trim();
}

async function account(browser, mobile) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(mobile
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1180, height: 800, deviceScaleFactor: 1 });
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const email = 'rail.' + (mobile ? 'm' : 'd') + ROUND + '@parlz.com';
  php(['dbval.php', 'seed_code', email, CODE, 'register']);
  const id = await page.evaluate(async (u, e, c) => {
    const post = async (b) => (await (await fetch('/api/auth.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json());
    const reg = await post({ action: 'register', username: u, nickname: u, password: 'parlz-rail-2026', email: e, code: c });
    return reg.ok ? reg.user.id : 'ERR:' + JSON.stringify(reg);
  }, 'rail_' + (mobile ? 'm' : 'd') + ROUND, email, CODE);
  if (typeof id !== 'number') {
    throw new Error('注册失败 ' + id);
  }
  ids.push(id);
  await page.goto(BASE + '/index.php?chat', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}

async function measure(page, label) {
  const data = await page.evaluate(() => {
    const rail = document.querySelector('.rail');
    if (rail === null) {
      return { missing: true };
    }
    const rect = (n) => {
      const r = n.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const railBox = rect(rail);
    const tabs = Array.from(rail.querySelectorAll('.rail-tab')).map((tab) => {
      const svg = tab.querySelector('svg');
      const labelNode = tab.querySelector('.rail-label') ?? Array.from(tab.children).find((n) => n !== svg && n.tagName !== 'SVG');
      return {
        name: (tab.textContent ?? '').trim(),
        active: tab.classList.contains('is-active'),
        box: rect(tab),
        icon: svg === null ? null : rect(svg),
        iconStyle: svg === null ? null : (({ background, color, radius }) => ({ background, color, radius }))(
          (n => ({ background: getComputedStyle(n).backgroundColor, color: getComputedStyle(n).color, radius: getComputedStyle(n).borderRadius }))(svg.parentElement ?? svg)
        ),
        label: labelNode === undefined || labelNode === null ? null : { ...rect(labelNode), shown: getComputedStyle(labelNode).display !== 'none' },
      };
    });
    const pill = rail.querySelector('.rail-pill');
    const avatar = rail.querySelector('.rail-avatar');
    const cs = getComputedStyle(rail);
    return {
      railBox,
      railStyle: { position: cs.position, zIndex: cs.zIndex, height: cs.height, radius: cs.borderRadius, overflow: cs.overflow, background: cs.backgroundColor },
      pill: pill === null ? null : rect(pill),
      avatar: avatar === null ? null : rect(avatar),
      tabs,
      docScrollW: document.documentElement.scrollWidth,
      vw: window.innerWidth,
    };
  });
  const rail = await page.$('.rail');
  if (rail !== null && data.missing !== true) {
    await rail.screenshot({ path: OUT + '/rail-' + label + '.png' });
  }
  await page.screenshot({ path: OUT + '/full-' + label + '.png' });
  console.log('--- ' + label + ': ' + JSON.stringify(data));
  return data;
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  await fetch(BASE + '/tests/clear_rate.php').catch(() => {});
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const mobile = await account(browser, true);
  const m = await measure(mobile, 'mobile-light');
  await mobile.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await new Promise((r) => setTimeout(r, 400));
  await measure(mobile, 'mobile-dark');
  for (const view of ['contact', 'moments', 'setting']) {
    await mobile.evaluate((name) => { window.history.pushState({ parlz: true }, '', '/index.php?' + name); window.dispatchEvent(new PopStateEvent('popstate')); }, view);
    await new Promise((r) => setTimeout(r, 900));
    await measure(mobile, 'mobile-' + view);
  }
  const desk = await account(browser, false);
  await measure(desk, 'desktop-light');

  const railBox = m.railBox ?? {};
  const pill = m.pill ?? {};
  const active = (m.tabs ?? []).find((t) => t.active) ?? null;
  const problems = [];
  if (m.missing === true) {
    problems.push('找不到 .rail');
  }
  if (active !== null && pill.x !== undefined) {
    const pillCx = pill.x + pill.w / 2;
    const tabCx = active.icon !== null ? active.icon.x + active.icon.w / 2 : active.box.x + active.box.w / 2;
    if (Math.abs(pillCx - tabCx) > 2) {
      problems.push('滑块圆心与选中项圆心差 ' + Math.round(pillCx - tabCx) + 'px');
    }
  }
  (m.tabs ?? []).forEach((tab) => {
    if (tab.box.y + tab.box.h > (railBox.y ?? 0) + (railBox.h ?? 0) + 1) {
      problems.push(tab.name + ' 超出导航栏下沿');
    }
    if (tab.label !== null && tab.label.shown && tab.label.y + tab.label.h > (railBox.y ?? 0) + (railBox.h ?? 0) + 1) {
      problems.push(tab.name + ' 的文字被导航栏裁掉');
    }
  });
  if ((m.docScrollW ?? 0) > (m.vw ?? 0)) {
    problems.push('出现横向溢出 ' + m.docScrollW + '>' + m.vw);
  }
  console.log(problems.length === 0 ? '导航栏量测：没有发现越界/错位' : '导航栏问题:\n' + problems.join('\n'));
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
