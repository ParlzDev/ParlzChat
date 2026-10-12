import { esc } from './util.js';
import { icon } from './icons.js';

const OFFICE = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const INLINE = new Set(['pdf', 'txt', 'md', 'csv']);

let layer = null;

function close() {
  if (layer !== null) {
    layer.remove();
    layer = null;
  }
}

function hostTitle(url, title) {
  if (typeof title === 'string' && title !== '') {
    return title;
  }
  return url.host === '' ? url.href : url.host;
}

function absolute(url) {
  return url.origin + url.pathname + url.search;
}

function extensionOf(url) {
  const match = /\.([a-z0-9]{2,5})$/i.exec(url.pathname);
  return match === null ? '' : match[1].toLowerCase();
}

function sourceUrl(url) {
  const name = url.pathname.split('/').pop() ?? '';
  if (/^\/?assets\/uploads\//.test(url.pathname) && /^[A-Za-z0-9._-]{1,120}$/.test(name)) {
    return window.location.origin + '/preview.php?f=' + encodeURIComponent(name);
  }
  return absolute(url);
}

function frameSrc(url, internal) {
  const ext = extensionOf(url);
  if (OFFICE.has(ext)) {
    return 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(sourceUrl(url));
  }
  if (internal && INLINE.has(ext)) {
    return sourceUrl(url);
  }
  return absolute(url);
}

function shell(title, extra, bodyHtml) {
  close();
  const node = document.createElement('div');
  node.className = 'embed-layer';
  node.innerHTML =
    '<header class="embed-head">' +
      '<span class="embed-title">' + esc(title) + '</span>' +
      extra +
      '<button type="button" class="embed-close" title="关闭">' + icon('close') + '</button>' +
    '</header>' + bodyHtml;
  document.body.appendChild(node);
  node.querySelector('.embed-close').addEventListener('click', close);
  layer = node;
  return node;
}

function openFrame(url, title) {
  const internal = url.origin === window.location.origin;
  shell(hostTitle(url, title), '', '<iframe class="embed-frame" src="' + esc(frameSrc(url, internal)) + '"></iframe>');
}

function showRisk(url, title) {
  const node = shell(hostTitle(url, title), '',
    '<div class="embed-wrap"><div class="embed-card">' +
      '<h3 class="section-title">即将打开外部网站</h3>' +
      '<p class="setting-desc">这个链接不在 Parlz 站内，请确认来源可信再继续</p>' +
      '<p class="setting-desc mono">' + esc(absolute(url)) + '</p>' +
      '<div class="form-actions embed-actions">' +
        '<button type="button" class="btn btn-primary" id="pv-go">继续访问</button>' +
        '<button type="button" class="btn" id="pv-cancel">取消</button>' +
      '</div>' +
    '</div></div>');
  node.querySelector('#pv-go').addEventListener('click', () => { openFrame(url, title); });
  node.querySelector('#pv-cancel').addEventListener('click', close);
}

export function closePreview() {
  close();
}

export function openPreview(rawUrl, title) {
  let url = null;
  try {
    url = new URL(String(rawUrl ?? ''), window.location.origin);
  } catch (error) {
    url = null;
  }
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return false;
  }
  if (url.origin === window.location.origin) {
    openFrame(url, title);
    return true;
  }
  showRisk(url, title);
  return true;
}

export function init() {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    const data = event.data;
    if (data === null || typeof data !== 'object') {
      return;
    }
    if (data.type === 'parlz-embed-close') {
      close();
      return;
    }
    if (data.type === 'parlz-embed-open' && typeof data.url === 'string' && data.url !== '') {
      close();
      window.location.href = data.url;
    }
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a.link-out, a.link-card');
    if (link === null) {
      return;
    }
    const href = link.getAttribute('href') ?? '';
    if (href === '') {
      return;
    }
    event.preventDefault();
    const label = link.querySelector('.link-card-title');
    openPreview(href, label !== null ? String(label.textContent ?? '') : String(link.textContent ?? ''));
  }, true);
}
