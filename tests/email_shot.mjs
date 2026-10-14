import { createRequire } from 'node:module';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'C:/Users/JGZ_YES/AppData/Local/Temp/parlz-audit';
const CODE = '246810';
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

async function shoot(browser, file, dark, width, shot) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.goto('file:///' + file, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 350));
  const probe = await page.evaluate(() => {
    const canvas = document.querySelector('.mail-canvas');
    const card = document.querySelector('.mail-card');
    const code = document.querySelector('.mail-code');
    const span = code === null ? null : code.querySelector('span');
    const box = (n) => {
      const r = n.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const lightBg = Array.from(document.querySelectorAll('*')).filter((n) => {
      const c = getComputedStyle(n).backgroundColor;
      const m = c.match(/^rgba?\((\d+), (\d+), (\d+)/);
      if (m === null) {
        return false;
      }
      const lum = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
      return lum > 0.75;
    }).map((n) => (n.className === '' ? n.tagName.toLowerCase() : n.tagName.toLowerCase() + '.' + String(n.className).trim().replace(/\s+/g, '.')) + '=' + getComputedStyle(n).backgroundColor);
    return {
      canvasBg: getComputedStyle(canvas).backgroundColor,
      cardBg: getComputedStyle(card).backgroundColor,
      cardBox: box(card),
      codeText: span === null ? '' : span.textContent.trim(),
      codeColor: span === null ? '' : getComputedStyle(span).color,
      codeSize: span === null ? '' : getComputedStyle(span).fontSize,
      docScrollW: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      lightBg: Array.from(new Set(lightBg)),
    };
  });
  await page.screenshot({ path: OUT + '/' + shot, fullPage: true });
  await page.close();
  return probe;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });

  const light = await shoot(browser, OUT + '/mail-register.html', false, 700, 'mail-light.png');
  console.log('亮色:', JSON.stringify(light));
  check('亮色：画布用站点浅底', light.canvasBg === 'rgb(238, 252, 244)', light.canvasBg);
  check('亮色：卡片是纯白', light.cardBg === 'rgb(255, 255, 255)', light.cardBg);
  check('亮色：验证码按文字渲染出来', light.codeText === CODE, light.codeText);
  check('亮色：验证码字号够大（>=24px）', parseFloat(light.codeSize) >= 24, light.codeSize);
  check('亮色：卡片宽度受控（<=460px）', light.cardBox.w <= 460, JSON.stringify(light.cardBox));

  const dark = await shoot(browser, OUT + '/mail-register.html', true, 700, 'mail-dark.png');
  console.log('深色:', JSON.stringify(dark));
  check('深色：画布切到站点深底', dark.canvasBg === 'rgb(16, 26, 21)', dark.canvasBg);
  check('深色：卡片切到 surface', dark.cardBg === 'rgb(22, 36, 28)', dark.cardBg);
  check('深色：验证码换成亮绿', dark.codeColor === 'rgb(35, 255, 125)', dark.codeColor);
  check('深色：没有任何一块还是浅底（漏掉 dark 分支就会红）', dark.lightBg.length === 0, dark.lightBg.join(' | '));

  const phone = await shoot(browser, OUT + '/mail-rebind.html', false, 390, 'mail-phone.png');
  console.log('手机 390px:', JSON.stringify(phone));
  check('手机宽度下不出现横向滚动', phone.docScrollW <= phone.vw, phone.docScrollW + ' vs ' + phone.vw);
  check('手机宽度下卡片仍然撑满可用宽度', phone.cardBox.w > 300 && phone.cardBox.w <= 460, JSON.stringify(phone.cardBox));

  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length === 0 ? '全部通过 (' + results.length + ')' : '失败: ' + bad.map((f) => f.name).join('、'));
  if (bad.length > 0) {
    process.exit(1);
  }
})().catch((error) => {
  console.error('异常: ' + error.message);
  process.exit(1);
});
