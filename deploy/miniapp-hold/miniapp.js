import { state } from './state.js';
import { $, esc, toast, paintPage, pageView, loadingHtml, armConfirm } from './util.js';
import { apiGet, apiPost } from './api.js';

const STATUS_LABEL = { draft: '草稿', pending: '审核中', approved: '已上线', rejected: '已驳回' };
const EMPTY = { phtml: '<div class="card">\n  <h2>你好，{{ me.nickname }}</h2>\n  <p>这是我的第一个小程序</p>\n  <button data-act="hi">点我</button>\n</div>', pcss: '.card {\n  padding: 16px;\n  background: #ffffff;\n  border-radius: 12px;\n}', pjs: "document.addEventListener('click', function (event) {\n  if (event.target.dataset.act === 'hi') {\n    parlz.toast('你好呀 ' + parlz.user.nickname);\n  }\n});", pphp: "// PPHP 是阉割版 PHP：变量 / echo / if / foreach / 字符串函数\n$word = 'Parlz';\necho '来自 ' . $word . ' 的小程序';\n" };

let apps = [];
let pending = [];
let isAdmin = false;
let editorOpen = false;
let current = null;

function appCard(app) {
  return '<div class="mini-card" data-act="mini-open" data-id="' + app.id + '">' +
    '<span class="mini-icon">' + esc(app.icon === '' ? '🧩' : app.icon) + '</span>' +
    '<span class="mini-main"><span class="mini-name">' + esc(app.name) +
    '<span class="pending-tag">' + esc(STATUS_LABEL[app.status] ?? app.status) + '</span></span>' +
    '<span class="mini-brief">' + esc(app.brief === '' ? app.owner_name : app.brief) + '</span></span>' +
    '</div>';
}

function listHtml() {
  let html = '<section class="setting-block">' +
    '<div class="setting-row"><div><div class="setting-title">小程序</div>' +
    '<div class="setting-desc">用 PHTML / PCSS / PJS / PPHP 写的小应用，审核通过后所有人可用</div></div>' +
    '<button type="button" class="btn btn-sm btn-primary" data-act="mini-new">新建</button></div>' +
    '</section>';

  const live = apps.filter((app) => app.status === 'approved');
  html += '<h3 class="section-title">已上线 · ' + live.length + '</h3>';
  html += live.length === 0
    ? '<p class="empty-note">还没有上线的小程序，点右上「新建」写一个</p>'
    : '<div class="mini-grid">' + live.map(appCard).join('') + '</div>';

  const mine = apps.filter((app) => app.mine === true);
  if (mine.length > 0) {
    html += '<h3 class="section-title">我创建的 · ' + mine.length + '</h3>';
    html += '<div class="mini-grid">' + mine.map(appCard).join('') + '</div>';
  }

  if (isAdmin) {
    html += '<h3 class="section-title">待审核 · ' + pending.length + '</h3>';
    html += pending.length === 0
      ? '<p class="empty-note">没有待审核的小程序</p>'
      : pending.map((app) => '<div class="row"><span class="row-main"><span class="row-name">' + esc(app.name) + '</span>' +
        '<span class="row-sub">' + esc(app.owner_name) + ' · ' + esc(app.brief) + '</span></span>' +
        '<span class="row-actions">' +
        '<button type="button" class="btn btn-sm" data-act="mini-review" data-id="' + app.id + '" data-verdict="reject">驳回</button>' +
        '<button type="button" class="btn btn-sm btn-primary" data-act="mini-review" data-id="' + app.id + '" data-verdict="approve">通过</button>' +
        '</span></div>').join('');
  }
  return html;
}

function editorHtml() {
  const app = current ?? { id: 0, name: '', icon: '', brief: '', files: {} };
  const files = app.files ?? {};
  const field = (ext, label, hint) =>
    '<label class="field"><span class="field-label">' + label + '</span>' +
    '<textarea class="input mini-code" id="mini-' + ext + '" rows="6" spellcheck="false" placeholder="' + esc(hint) + '">' +
    esc(files[ext] ?? '') + '</textarea></label>';
  return '<section class="setting-block">' +
    '<label class="field"><span class="field-label">名字</span>' +
    '<input class="input" id="mini-name" maxlength="20" value="' + esc(app.name) + '" placeholder="例如 打卡助手"></label>' +
    '<label class="field"><span class="field-label">图标（一个表情就够）</span>' +
    '<input class="input" id="mini-icon" maxlength="4" value="' + esc(app.icon) + '" placeholder="🧩"></label>' +
    '<label class="field"><span class="field-label">一句话介绍</span>' +
    '<input class="input" id="mini-brief" maxlength="60" value="' + esc(app.brief) + '" placeholder="说清它是干嘛的"></label>' +
    field('phtml', 'PHTML（阉割版 HTML）', EMPTY.phtml) +
    field('pcss', 'PCSS（阉割版 CSS，禁外链）', EMPTY.pcss) +
    field('pjs', 'PJS（阉割版 JS，禁联网）', EMPTY.pjs) +
    field('pphp', 'PPHP（阉割版 PHP：变量/echo/if/foreach + 少量函数）', EMPTY.pphp) +
    '</section>' +
    '<div class="form-actions">' +
    '<button type="button" class="btn btn-primary" data-act="mini-save" data-id="' + app.id + '">保存</button>' +
    (app.id > 0 ? '<button type="button" class="btn" data-act="mini-submit" data-id="' + app.id + '">提交审核</button>' : '') +
    (app.id > 0 ? '<button type="button" class="btn btn-danger" data-act="mini-delete" data-id="' + app.id + '" data-label="删除">删除</button>' : '') +
    '<button type="button" class="btn" data-act="mini-back">返回列表</button>' +
    '</div>' +
    (app.status === 'rejected' && app.review_note !== '' ? '<p class="danger-note">上次驳回原因：' + esc(app.review_note) + '</p>' : '');
}

function draw() {
  paintPage('miniapp', '小程序', editorOpen ? editorHtml() : listHtml());
}

async function load() {
  const res = await apiGet('api/miniapp.php', { action: 'list' });
  apps = res.apps ?? [];
  pending = res.pending ?? [];
  isAdmin = res.is_admin === true;
  draw();
}

export async function render() {
  editorOpen = false;
  current = null;
  paintPage('miniapp', '小程序', loadingHtml());
  try {
    await load();
  } catch (error) {
    paintPage('miniapp', '小程序', '<p class="empty-note">' + esc(error.message) + '</p>');
  }
}

function openApp(appId) {
  const node = document.createElement('div');
  node.className = 'mini-runner';
  node.innerHTML = '<header class="embed-head"><span class="embed-title">小程序</span>' +
    '<button type="button" class="embed-close" title="关闭">✕</button></header>' +
    '<iframe class="mini-frame" sandbox="allow-scripts" src="miniapp-run.php?id=' + appId + '"></iframe>';
  document.body.appendChild(node);
  const close = () => node.remove();
  node.querySelector('.embed-close').addEventListener('click', close);
  const onMessage = (event) => {
    if (event.source !== node.querySelector('iframe').contentWindow) {
      return;
    }
    const payload = event.data;
    if (payload === null || typeof payload !== 'object') {
      return;
    }
    if (payload.type === 'mini-close') {
      close();
    } else if (payload.type === 'mini-toast') {
      toast(String(payload.text ?? ''));
    }
  };
  window.addEventListener('message', onMessage);
  node.addEventListener('DOMNodeRemoved', () => window.removeEventListener('message', onMessage));
}

export function init() {
  $('#page-view').addEventListener('click', async (event) => {
    if (pageView() !== 'miniapp') {
      return;
    }
    const target = event.target.closest('[data-act]');
    if (target === null) {
      return;
    }
    const act = target.dataset.act;
    const id = Number(target.dataset.id ?? 0);
    if (act === 'mini-new') {
      current = null;
      editorOpen = true;
      draw();
    } else if (act === 'mini-back') {
      editorOpen = false;
      current = null;
      draw();
    } else if (act === 'mini-open') {
      const app = apps.find((row) => row.id === id);
      if (app !== undefined && app.mine === true && app.status !== 'approved') {
        try {
          const res = await apiGet('api/miniapp.php', { action: 'get', id });
          current = res.app;
          editorOpen = true;
          draw();
        } catch (error) {
          toast(error.message, true);
        }
        return;
      }
      openApp(id);
    } else if (act === 'mini-save') {
      const body = { action: 'save', id };
      ['phtml', 'pcss', 'pjs', 'pphp'].forEach((ext) => {
        const node = $('#mini-' + ext);
        body['file_' + ext] = node === null ? '' : node.value;
      });
      ['name', 'icon', 'brief'].forEach((key) => {
        const node = $('#mini-' + key);
        body[key] = node === null ? '' : node.value;
      });
      try {
        const res = await apiPost('api/miniapp.php', body);
        toast('已保存');
        const saved = await apiGet('api/miniapp.php', { action: 'get', id: res.id });
        current = saved.app;
        editorOpen = true;
        await load();
      } catch (error) {
        toast(error.message, true);
      }
    } else if (act === 'mini-submit') {
      try {
        await apiPost('api/miniapp.php', { action: 'submit', id });
        toast('已提交，等管理员审核');
        editorOpen = false;
        current = null;
        await load();
      } catch (error) {
        toast(error.message, true);
      }
    } else if (act === 'mini-review') {
      const verdict = target.dataset.verdict === 'approve' ? 'approve' : 'reject';
      try {
        await apiPost('api/miniapp.php', { action: 'review', id, verdict, note: '' });
        toast(verdict === 'approve' ? '已通过' : '已驳回');
        await load();
      } catch (error) {
        toast(error.message, true);
      }
    } else if (act === 'mini-delete') {
      if (armConfirm(target, () => {})) {
        return;
      }
      try {
        await apiPost('api/miniapp.php', { action: 'delete', id });
        toast('已删除');
        editorOpen = false;
        current = null;
        await load();
      } catch (error) {
        toast(error.message, true);
      }
    }
  });
}
