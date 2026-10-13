import { esc, loadingHtml } from './util.js';
import { icon } from './icons.js';

const OFFICE = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
const INLINE = new Set(['pdf', 'txt', 'md', 'csv']);
const PICTURE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico']);

let layer = null;
let imageUrl = '';

function close() {
  if (imageUrl !== '') {
    URL.revokeObjectURL(imageUrl);
    imageUrl = '';
  }
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
  if (internal) {
    return absolute(url);
  }
  return 'proxy.php?url=' + encodeURIComponent(absolute(url));
}

function fullPageHref(url, internal) {
  if (internal) {
    return absolute(url);
  }
  return 'proxy.php?url=' + encodeURIComponent(absolute(url));
}

function shell(title, bodyHtml) {
  close();
  const node = document.createElement('div');
  node.className = 'embed-layer';
  node.innerHTML =
    '<header class="embed-head">' +
      '<span class="embed-title">' + esc(title) + '</span>' +
      '<button type="button" class="embed-close" title="关闭">' + icon('close') + '</button>' +
    '</header>' + bodyHtml;
  document.body.appendChild(node);
  node.querySelector('.embed-close').addEventListener('click', close);
  layer = node;
  return node;
}

function openImage(url, title) {
  const internal = url.origin === window.location.origin;
  const node = shell(hostTitle(url, title),
    '<div class="embed-image-wrap" id="pv-holder">loadingHtml()</div>');
  const source = internal ? absolute(url) : 'proxy.php?url=' + encodeURIComponent(absolute(url));
  fetch(source, { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('图片打不开');
      }
      return response.blob();
    })
    .then((blob) => {
      if (layer !== node) {
        return;
      }
      const holder = node.querySelector('#pv-holder');
      if (holder === null) {
        return;
      }
      imageUrl = URL.createObjectURL(blob);
      holder.innerHTML = '';
      const image = document.createElement('img');
      image.className = 'embed-image';
      image.alt = '';
      image.src = imageUrl;
      image.addEventListener('click', () => {
        image.classList.toggle('is-actual');
      });
      holder.appendChild(image);
    })
    .catch((error) => {
      const holder = node.querySelector('#pv-holder');
      if (holder !== null) {
        holder.innerHTML = '<p class="setting-desc">' + esc(error.message || '图片打不开') + '</p>';
      }
    });
}

function openFrame(url, title) {
  const internal = url.origin === window.location.origin;
  if (PICTURE.has(extensionOf(url))) {
    openImage(url, title);
    return;
  }
  if (internal) {
    shell(hostTitle(url, title), '<iframe class="embed-frame" src="' + esc(frameSrc(url, internal)) + '"></iframe>');
    return;
  }
  openProxyWindow(url, title);
}

function openProxyWindow(url, title) {
  const href = fullPageHref(url, false);
  const opened = window.open(href, '_blank');
  if (opened !== null && opened !== undefined) {
    close();
    return;
  }
  const node = shell(hostTitle(url, title),
    '<div class="embed-wrap"><div class="embed-card">' +
      '<h3 class="section-title">浏览器挡住了新窗口</h3>' +
      '<p class="setting-desc">点下面的按钮，用站内代理打开这个页面</p>' +
      '<p class="setting-desc mono">' + esc(absolute(url)) + '</p>' +
      '<div class="form-actions embed-actions">' +
        '<a class="btn btn-primary" href="' + esc(href) + '" target="_blank" rel="noopener">用代理打开</a>' +
        '<button type="button" class="btn" id="pv-cancel">取消</button>' +
      '</div>' +
    '</div></div>');
  node.querySelector('#pv-cancel').addEventListener('click', close);
}

function showRisk(url, title) {
  const node = shell(hostTitle(url, title),
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
      let target = null;
      try {
        target = new URL(data.url, window.location.origin);
      } catch (error) {
        target = null;
      }
      if (target !== null && target.origin === window.location.origin) {
        close();
        window.location.href = target.href;
      }
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
