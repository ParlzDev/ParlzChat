import { esc, avatarHtml, uploadUrl, uidUserId, fmtSize, downloadFile } from './util.js';
import { stickerSvg } from './stickers.js';
import { renderBody, parseQuote, quotePreview, parseFile, mediaKind } from './richtext.js';
import { icon } from './icons.js';
import { mediaUpgrade } from './media.js';
import { state } from './state.js';

const POPUP_FEATURES = 'popup=yes,width=760,height=620,resizable=yes,scrollbars=yes';
const MOBILE_QUERY = '(max-width: 900px)';
let recordZ = 300;

export function parseRecord(body) {
  try {
    const parsed = JSON.parse(String(body ?? ''));
    if (parsed && Array.isArray(parsed.items)) {
      return { title: String(parsed.title ?? '聊天记录'), items: parsed.items };
    }
  } catch {
    return null;
  }
  return null;
}

function origin() {
  return window.location.origin;
}

function recordDocument(data) {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  return '<!doctype html><html lang="zh-CN" data-theme="' + theme + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(data.title) + '</title>' +
    '<link rel="stylesheet" href="' + origin() + '/assets/style/base.css">' +
    '<link rel="stylesheet" href="' + origin() + '/assets/style/components.css">' +
    '<link rel="stylesheet" href="' + origin() + '/assets/style/record.css">' +
    '</head><body class="record-popup">' +
    '<header class="record-head"><span class="record-title">' + esc(data.title) + '</span>' +
    '<span class="record-count">' + data.items.length + ' 条消息</span></header>' +
    '<div class="mw-body" id="record-body"></div>' +
    '<script>window.__record=' + payload + ';<\/script>' +
    '<script type="module" src="' + origin() + '/assets/scripts/record.js"><\/script>' +
    '</body></html>';
}

export function openRecordPopup(data) {
  if (data === null) {
    return null;
  }
  const blob = new Blob([recordDocument(data)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, '_blank', POPUP_FEATURES);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  return popup;
}

export function openRecordFromBody(body) {
  const data = parseRecord(body);
  if (data === null) {
    return null;
  }
  return openRecord(data);
}

function isMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function inPopup() {
  return document.body.classList.contains('record-popup');
}

export function openRecordWindow(data) {
  if (data === null) {
    return null;
  }
  if (recordZ >= 390) {
    recordZ = 300;
  }
  const win = document.createElement('div');
  win.className = 'rp-window rp-full';
  win.style.zIndex = String(++recordZ);
  win.innerHTML = '<header class="record-head">' +
    '<button type="button" class="rp-close rp-back" data-rp-close title="返回">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6L9 12l5.5 6 1.5-1.5L11.5 12 16 7.5z"/></svg>' +
    '</button>' +
    '<span class="record-title">' + esc(data.title) + '</span>' +
    '<span class="record-count">' + data.items.length + ' 条消息</span>' +
    '</header>' +
    '<div class="mw-body" data-rp-body></div>';
  document.body.appendChild(win);
  const myUid = state.user ? (state.user.uid ?? '') : '';
  renderRecord(win.querySelector('[data-rp-body]'), data, myUid);
  win.querySelector('[data-rp-close]').addEventListener('click', () => win.remove());
  return win;
}

export function openRecord(data) {
  if (data === null) {
    return null;
  }
  if (isMobile() && !inPopup()) {
    return openRecordWindow(data);
  }
  return openRecordPopup(data);
}

function itemHtml(item, index, myUid) {
  const mine = item.uid !== undefined && item.uid !== ''
    ? String(item.uid).toUpperCase() === myUid
    : false;
  const avatar = avatarHtml({ id: uidUserId(item.uid ?? ''), nickname: item.name, avatar: item.avatar ?? '' }, 'avatar-sm', false, false);
  let content = '';
  if (item.kind === 'merged') {
    const inner = parseRecord(item.body);
    content = '<button type="button" class="merged-card is-nested" data-record="' + index + '">' +
      '<span class="merged-head">' + esc(inner === null ? '聊天记录' : inner.title) + '</span>' +
      '<span class="merged-foot">' + (inner === null ? 0 : inner.items.length) + ' 条消息 · 点击查看</span>' +
      '</button>';
  } else if (item.kind === 'image') {
    content = '<img class="merged-thumb" src="' + esc(uploadUrl(item.body)) + '" alt="图片" loading="lazy">';
  } else if (item.kind === 'sticker') {
    content = '<span class="sticker-inline">' + stickerSvg(item.body) + '</span>';
  } else if (item.kind === 'csticker') {
    content = '<img class="merged-sticker-img" src="' + esc(uploadUrl(item.body)) + '" alt="表情" loading="lazy">';
  } else if (item.kind === 'file') {
    const fileData = parseFile(item.body);
    if (fileData === null) {
      content = '<span class="merged-text">' + renderBody(item.body) + '</span>';
    } else if (mediaKind(fileData.name) !== '') {
      content = '<span class="mplayer" data-media="' + mediaKind(fileData.name) + '" data-src="' + esc(uploadUrl(fileData.file)) + '"' +
        ' data-file="' + esc(fileData.file) + '" data-name="' + esc(fileData.name) + '"' +
        ' data-size="' + esc(fmtSize(fileData.size)) + '"></span>';
    } else {
      content = '<span class="merged-file">' + icon('file') +
        '<span class="file-body"><span class="file-name">' + esc(fileData.name) + '</span>' +
        '<span class="file-size">' + fmtSize(fileData.size) + '</span></span>' +
        '</span>';
    }
  } else if (item.kind === 'voice') {
    const voiceData = parseFile(item.body);
    if (voiceData === null) {
      content = '<span class="merged-text">' + renderBody(item.body) + '</span>';
    } else {
      const vdur = Math.max(1, Math.min(600, voiceData.dur || Math.max(1, Math.round(voiceData.size / 2000))));
      content = '<span class="mplayer" data-media="voice" data-src="' + esc(uploadUrl(voiceData.file)) + '"' +
        ' data-file="' + esc(voiceData.file) + '" data-name="' + esc(voiceData.name) + '" data-dur="' + vdur + '"></span>';
    }
  } else if (item.kind === 'quote') {
    const quoteData = parseQuote(item.body);
    content = quoteData === null
      ? '<span class="merged-text">' + renderBody(item.body) + '</span>'
      : '<span class="merged-quote-card">' +
          '<span class="merged-quote-name">' + esc(quoteData.quote.name ?? '') + '</span>' +
          '<span class="merged-quote-text">' + esc(quotePreview(quoteData.quote)) + '</span>' +
        '</span>' +
        '<span class="merged-text">' + renderBody(quoteData.text) + '</span>';
  } else {
    content = '<span class="merged-text">' + renderBody(item.body) + '</span>';
  }
  const bubble = item.kind === 'merged' ? content : '<span class="merged-bubble">' + content + '</span>';
  return '<div class="merged-item' + (mine ? ' is-right' : '') + '">' + avatar +
    '<div class="merged-cell"><span class="merged-name">' + esc(item.name) + '</span>' + bubble + '</div></div>';
}

function openPopupViewer(src) {
  const layer = document.createElement('div');
  layer.className = 'rp-viewer';
  layer.innerHTML = '<img src="' + esc(src) + '" alt="图片">';
  layer.addEventListener('click', () => layer.remove());
  document.body.appendChild(layer);
}

export function renderRecord(bodyNode, data, myUid) {
  const me = String(myUid ?? '').toUpperCase();
  bodyNode.innerHTML = data.items.map((item, index) => itemHtml(item, index, me)).join('');
  bodyNode.querySelectorAll('[data-record]').forEach((card) => {
    card.addEventListener('click', () => {
      const item = data.items[Number(card.dataset.record)];
      if (item === undefined) {
        return;
      }
      const inner = parseRecord(item.body);
      if (inner !== null) {
        openRecord(inner);
      }
    });
  });
  if (inPopup()) {
    bodyNode.querySelectorAll('.merged-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        openPopupViewer(thumb.getAttribute('src') ?? '');
      });
    });
    bodyNode.querySelectorAll('.media-dl').forEach((button) => {
      button.addEventListener('click', () => {
        downloadFile(uploadUrl(button.dataset.file ?? ''), button.dataset.name ?? '文件');
      });
    });
  }
  mediaUpgrade(bodyNode);
}

function boot() {
  const data = window.__record;
  const bodyNode = document.getElementById('record-body');
  if (!data || bodyNode === null) {
    return;
  }
  renderRecord(bodyNode, data, '');
}

boot();
