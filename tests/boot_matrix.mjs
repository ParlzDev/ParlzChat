import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'F:\\AI-Project\\Parlz[Chatter]\\';
const REV = process.env.PARLZ_STALE_REV ?? 'HEAD~8';
const OUT = 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit';
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

function gitShow(rev, path) {
  return execFileSync('git', ['-C', ROOT, 'show', rev + ':' + path], { encoding: 'utf8', maxBuffer: 16 << 20 });
}

function workFile(file) {
  try {
    return readFileSync(ROOT + 'assets/scripts/' + file, 'utf8');
  } catch (error) {
    return '';
  }
}

function exportsOf(src) {
  const names = new Set();
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)|export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g;
  let m = null;
  while ((m = re.exec(src)) !== null) {
    names.add(m[1] ?? m[2]);
  }
  if (/export\s*\{/.test(src)) {
    const re2 = /export\s*\{([^}]*)\}/g;
    let g = null;
    while ((g = re2.exec(src)) !== null) {
      g[1].split(',').forEach((piece) => {
        const name = piece.trim().split(/\s+as\s+/).pop().trim();
        if (name !== '') {
          names.add(name);
        }
      });
    }
  }
  return names;
}

function importsOf(src) {
  const pairs = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+?)'/g;
  let m = null;
  while ((m = re.exec(src)) !== null) {
    m[1].split(',').forEach((piece) => {
      const name = piece.trim().split(/\s+as\s+/)[0].trim();
      if (name !== '') {
        pairs.push([m[2].replace(/\?.*$/, ''), name]);
      }
    });
  }
  return pairs;
}

async function boot(browser, staleMap, shot) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('401')) {
      errors.push('console: ' + m.text());
    }
  });
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (staleMap !== null) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const hit = Object.entries(staleMap).find(([name]) => req.url().includes('/assets/scripts/' + name));
      if (hit !== undefined) {
        req.respond({ status: 200, contentType: 'application/javascript; charset=utf-8', body: hit[1] });
        return;
      }
      req.continue();
    });
  }
  await page.goto(BASE + '/index.php', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 3200));
  const state = await page.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    loginBox: document.getElementById('auth-screen') !== null && !document.getElementById('auth-screen').classList.contains('is-hidden'),
    fields: document.querySelectorAll('#auth-screen input').length,
  }));
  await page.screenshot({ path: OUT + '/' + shot });
  await page.close();
  return { state, errors };
}

(async () => {
  const files = readdirSync(ROOT + 'assets/scripts').filter((f) => f.endsWith('.js'));
  const broken = [];
  files.forEach((file) => {
    const headSrc = workFile(file);
    if (headSrc === '') {
      return;
    }
    importsOf(headSrc).forEach(([target, name]) => {
      let oldSrc = '';
      try {
        oldSrc = gitShow(REV, 'assets/scripts/' + target);
      } catch (error) {
        return;
      }
      if (!exportsOf(oldSrc).has(name)) {
        broken.push(file + ' 向 ' + target + ' 要了 ' + REV + ' 版本里没有的导出 ' + name);
      }
    });
  });
  check('静态：没有模块向"可能被缓存的旧模块"要新导出（' + REV + ' 基线）', broken.length === 0, broken.join(' | '));

  const staleMap = {};
  files.forEach((file) => {
    try {
      staleMap[file] = gitShow(REV, 'assets/scripts/' + file);
    } catch (error) {
      const current = workFile(file);
      if (current !== '') {
        staleMap[file] = current;
      }
    }
  });
  delete staleMap['app.js'];

  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const clean = await boot(browser, null, 'boot-clean.png');
  console.log('干净缓存:', JSON.stringify(clean));
  check('干净缓存能打开登录页', clean.state.loginBox === true && clean.state.fields >= 2, JSON.stringify(clean.state));
  check('干净缓存没有模块错误', clean.errors.length === 0, clean.errors.join(' | '));

  const mixed = await boot(browser, staleMap, 'boot-stale.png');
  console.log('旧模块混搭:', JSON.stringify(mixed));
  check('旧模块混搭也能打开登录页（不许整页空白）', mixed.state.loginBox === true && mixed.state.fields >= 2, JSON.stringify(mixed.state));
  check('旧模块混搭没有链接错误', mixed.errors.length === 0, mixed.errors.join(' | '));
  await browser.close();

  const bad = results.filter((r) => !r.ok);
  console.log(bad.length === 0 ? '全部通过 (' + results.length + ')' : '失败: ' + bad.map((f) => f.name).join('、'));
  if (bad.length > 0) {
    process.exit(1);
  }
})().catch((e) => {
  console.error('异常: ' + e.message);
  process.exit(1);
});

