export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function skinFor(id) {
  return Math.abs(Number(id) || 0) % 4;
}

export function initials(name) {
  const clean = String(name ?? '').trim();
  if (clean === '') {
    return '?';
  }
  const cjk = clean.match(/[\u3400-\u9fff]/);
  if (cjk !== null) {
    return cjk[0];
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function avatarUrl(name) {
  return window.location.origin + '/assets/avatars/' + encodeURIComponent(String(name ?? ''));
}

export function uploadUrl(name) {
  return window.location.origin + '/assets/uploads/' + encodeURIComponent(String(name ?? ''));
}

export function fmtSize(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) {
    return n + ' B';
  }
  if (n < 1048576) {
    return (n / 1024).toFixed(1) + ' KB';
  }
  return (n / 1048576).toFixed(1) + ' MB';
}

export function safeFileName(name) {
  const clean = String(name ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim();
  return clean === '' ? 'parlz-file' : clean.slice(0, 80);
}

function nativeSaveBridge() {
  const bridge = window.ParlzAndroid ?? window.ParlzIOS;
  return bridge && typeof bridge.beginSave === 'function' && typeof bridge.chunkSave === 'function' && typeof bridge.finishSave === 'function'
    ? bridge
    : null;
}

async function androidSaveBlob(blob, name, mime) {
  const bridge = nativeSaveBridge();
  bridge.beginSave(safeFileName(name), mime || blob.type || 'application/octet-stream');
  const chunkSize = 512 * 1024;
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const slice = blob.slice(offset, offset + chunkSize);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(slice);
    });
    bridge.chunkSave(dataUrl.slice(dataUrl.indexOf(',') + 1));
  }
  bridge.finishSave();
}

export async function downloadFile(url, name) {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('读取文件失败');
    }
    const blob = await response.blob();
    if (nativeSaveBridge() !== null) {
      await androidSaveBlob(blob, name, blob.type);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = safeFileName(name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    toast('开始下载 ' + safeFileName(name));
  } catch (error) {
    toast('下载失败：' + (error && error.message ? error.message : '浏览器不允许'), true);
  }
}

export function uidForUser(id) {
  return 'U' + String(Math.max(0, Number(id) || 0)).padStart(5, '0');
}

export function uidForGroup(id) {
  return 'A' + String(Math.max(0, Number(id) || 0)).padStart(5, '0');
}

export function avatarHtml(user, size = '', online = false, profile = false) {
  const classes = ['avatar'];
  if (size !== '') {
    classes.push(size);
  }
  const source = user ?? {};
  const inner = source.avatar
    ? '<img src="' + avatarUrl(source.avatar) + '" alt="">'
    : '<span>' + esc(initials(source.nickname)) + '</span>';
  const status = String(source.status ?? '');
  const dot = online
    ? '<span class="avatar-on" data-status="' + esc(status === '' ? 'online' : status) + '"></span>'
    : '';
  const hint = profile && source.id ? ' data-user="' + source.id + '"' : '';
  return '<span class="' + classes.join(' ') + '" data-skin="' + skinFor(source.id) + '"' + hint + '>' + inner + dot + '</span>';
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function fmtClock(ts) {
  const date = new Date(ts * 1000);
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export function fmtListTime(ts) {
  if (!ts) {
    return '';
  }
  const date = new Date(ts * 1000);
  const now = new Date();
  if (sameDay(date, now)) {
    return fmtClock(ts);
  }
  const yesterday = new Date(now.getTime() - 86400000);
  if (sameDay(date, yesterday)) {
    return '昨天';
  }
  if (date.getFullYear() === now.getFullYear()) {
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function fmtMsgTime(ts) {
  const date = new Date(ts * 1000);
  const now = new Date();
  const clock = fmtClock(ts);
  if (sameDay(date, now)) {
    return clock;
  }
  const yesterday = new Date(now.getTime() - 86400000);
  if (sameDay(date, yesterday)) {
    return '昨天 ' + clock;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + clock;
  }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + clock;
}

let toastHost = null;

export function toast(message, isError = false) {
  toastHost = toastHost && document.body.contains(toastHost) ? toastHost : document.getElementById('toast-wrap');
  if (!toastHost) {
    return;
  }
  const node = document.createElement('div');
  node.className = isError ? 'toast toast-error' : 'toast';
  node.textContent = message;
  toastHost.appendChild(node);
  window.setTimeout(() => node.remove(), 2600);
}

export function throttle(fn, wait) {
  let last = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - last < wait) {
      return undefined;
    }
    last = now;
    return fn.apply(this, args);
  };
}

export function paintPanel(view, html) {
  const host = document.getElementById('panel-body');
  if (host === null) {
    return;
  }
  host.dataset.view = view;
  host.innerHTML = html;
}

export function panelView() {
  const host = document.getElementById('panel-body');
  return host === null ? '' : host.dataset.view ?? '';
}

const backArrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6L9 12l5.5 6 1.5-1.5L11.5 12 16 7.5z"/></svg>';

export function paintPage(view, title, html) {
  const host = document.getElementById('page-view');
  if (host === null) {
    return;
  }
  host.dataset.page = view;
  host.innerHTML =
    '<header class="page-head">' +
      '<button type="button" class="icon-btn page-back" data-back="1" title="返回">' + backArrow + '</button>' +
      '<h2 class="page-title">' + esc(title) + '</h2>' +
    '</header>' +
    '<div class="page-body">' + html + '</div>';
}

export function pageView() {
  const host = document.getElementById('page-view');
  return host === null ? '' : host.dataset.page ?? '';
}

export function armConfirm(button, run) {
  const label = button.dataset.label ?? '确认';
  if (button.dataset.armed === '1') {
    run();
    return;
  }
  button.dataset.armed = '1';
  button.textContent = '再点一次确认';
  window.setTimeout(() => {
    if (button.isConnected) {
      button.dataset.armed = '';
      button.textContent = label;
    }
  }, 3000);
}

export function uidName(uid) {
  return String(uid ?? '').trim().toUpperCase();
}

export function uidUserId(uid) {
  const match = /^U(\d{1,12})$/.exec(uidName(uid));
  return match === null ? 0 : Number(match[1]);
}

export function copyText(text) {
  const value = String(text ?? '');
  if (value === '') {
    return;
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value).then(
      () => toast('已复制 ' + value),
      () => fallbackCopy(value),
    );
    return;
  }
  fallbackCopy(value);
}

async function imageToPng(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  if (typeof bitmap.close === 'function') {
    bitmap.close();
  }
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (png === null) {
    throw new Error('图片转换失败');
  }
  return png;
}

export async function copyImage(url) {
  if (!navigator.clipboard || typeof window.ClipboardItem !== 'function' || !window.isSecureContext) {
    toast('当前环境不支持复制图片（需 HTTPS 或 localhost），可改用「复制图片链接」', true);
    return;
  }
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('读取图片失败');
    }
    const png = await imageToPng(await response.blob());
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': png })]);
    toast('图片已复制到剪贴板');
  } catch (error) {
    toast('复制图片失败：' + (error && error.message ? error.message : '浏览器不允许'), true);
  }
}

export async function downloadImage(url, name) {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('读取图片失败');
    }
    const blob = await response.blob();
    if (nativeSaveBridge() !== null) {
      await androidSaveBlob(blob, downloadName(name), blob.type);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = downloadName(name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    toast('图片已保存');
  } catch (error) {
    toast('保存图片失败：' + (error && error.message ? error.message : '浏览器不允许'), true);
  }
}

function downloadName(name) {
  const now = new Date();
  const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
    '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
  const ext = /\.webp$/i.test(String(name ?? '')) ? '.webp' : '.webp';
  return 'parlz-' + stamp + ext;
}

function fallbackCopy(value) {
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '1');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (error) {
    ok = false;
  }
  area.remove();
  toast(ok ? '已复制 ' + value : '复制失败，请手动选择', !ok);
}
