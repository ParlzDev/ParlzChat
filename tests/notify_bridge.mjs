import { createRequire } from 'node:module';

const nodeRequire = createRequire('C:/Users/JGZ_YES/AppData/Local/Temp/parlztest/index.js');
const puppeteer = nodeRequire('puppeteer-core');

const BASE = process.env.PARLZ_BASE ?? 'http://127.0.0.1:8461';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: ok === true });
  console.log((ok === true ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

async function run(setup, call) {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(setup);
  await page.goto(BASE + '/index.php?login', { waitUntil: 'domcontentloaded' });
  const out = await page.evaluate(call);
  await browser.close();
  return out;
}

(async () => {
  const android = await run(
    () => { window.__hits = []; window.ParlzAndroid = { notify: (a, b, c) => window.__hits.push(['android', a, b, c]) }; },
    async () => {
      const mod = await import('/assets/scripts/notify.js');
      mod.systemNotify('小明', '在吗', 3);
      return { hits: window.__hits, target: mod.notifyTarget() };
    },
  );
  check('安卓走 ParlzAndroid.notify', android.target === 'android' && android.hits.length === 1
    && android.hits[0][0] === 'android' && android.hits[0][1] === '小明' && android.hits[0][2] === '在吗' && android.hits[0][3] === 3,
  JSON.stringify(android));

  const win = await run(
    () => { window.__hits = []; window.chrome = { webview: { postMessage: (m) => window.__hits.push(m) } }; },
    async () => {
      const mod = await import('/assets/scripts/notify.js');
      mod.systemNotify('群公告', '今晚八点', 2);
      return { hits: window.__hits, target: mod.notifyTarget() };
    },
  );
  check('Windows 走 chrome.webview', win.target === 'windows' && win.hits[0]?.cmd === 'notify'
    && win.hits[0].title === '群公告' && win.hits[0].count === 2, JSON.stringify(win));

  const apple = await run(
    () => { window.__hits = []; window.webkit = { messageHandlers: { parlz: { postMessage: (m) => window.__hits.push(m) } } }; },
    async () => {
      const mod = await import('/assets/scripts/notify.js');
      mod.systemNotify('标题', '正文', 0);
      return { hits: window.__hits, target: mod.notifyTarget() };
    },
  );
  check('iOS/mac 走 messageHandlers.parlz', apple.target === 'apple' && apple.hits[0]?.cmd === 'notify'
    && apple.hits[0].body === '正文', JSON.stringify(apple));

  const linux = await run(
    () => { window.__hits = []; window.ParlzLinux = { notify: (a, b, c) => window.__hits.push(['linux', a, b, c]) }; },
    async () => {
      const mod = await import('/assets/scripts/notify.js');
      mod.systemNotify('李', '收到', 1);
      return { hits: window.__hits, target: mod.notifyTarget() };
    },
  );
  check('Linux 走 ParlzLinux.notify', linux.target === 'linux' && linux.hits.length === 1 && linux.hits[0][3] === 1, JSON.stringify(linux));

  const web = await run(
    () => {
      window.__hits = [];
      window.Notification = function (title, options) { window.__hits.push([title, options.body]); this.close = () => {}; };
      window.Notification.permission = 'granted';
    },
    async () => {
      const mod = await import('/assets/scripts/notify.js');
      mod.systemNotify('网页', '兜底', 0);
      return { hits: window.__hits, target: mod.notifyTarget() };
    },
  );
  check('无壳时退回 Web Notification', web.target === 'web' && web.hits.length === 1 && web.hits[0][0] === '网页', JSON.stringify(web));

  const none = await run(
    () => { window.Notification = undefined; },
    async () => {
      const mod = await import('/assets/scripts/notify.js');
      mod.systemNotify('什么都没有', '不该抛错', 0);
      return { done: true, target: mod.notifyTarget() };
    },
  );
  check('完全没有通知能力也不抛错', none.done === true && none.target === 'web', JSON.stringify(none));

  const bad = await run(
    () => { window.__hits = []; window.ParlzAndroid = { notify: () => { throw new Error('bridge 挂了'); } }; },
    async () => {
      const mod = await import('/assets/scripts/notify.js');
      let threw = false;
      try {
        mod.systemNotify('桥接异常', '不该冒泡', 0);
      } catch (error) {
        threw = true;
      }
      return { threw };
    },
  );
  check('bridge 抛错被吞掉，不影响页面', bad.threw === false, JSON.stringify(bad));

  const bad2 = results.filter((r) => !r.ok);
  console.log(bad2.length === 0 ? '全部通过 (' + results.length + ')' : '失败: ' + bad2.map((f) => f.name).join('、'));
  process.exit(bad2.length === 0 ? 0 : 1);
})();
