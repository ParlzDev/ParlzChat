import { esc } from './util.js';
import { stickerByLabel } from './stickers.js';

const TOKEN_RE = /\[([^\[\]<>]{1,12})\]|@([^\s@<>&]{1,24})|(https?:\/\/[^\s<>"']+)/g;

export function trimUrl(value) {
  let url = value;
  while (url !== '' && /[.,;:!?、。，；：！？）)】」》"']$/.test(url)) {
    url = url.slice(0, -1);
  }
  return url;
}

export function firstUrl(text) {
  const match = /https?:\/\/[^\s<>"']+/.exec(String(text ?? ''));
  return match === null ? '' : trimUrl(match[0]);
}

export function parseQuote(body) {
  try {
    const parsed = JSON.parse(String(body ?? ''));
    if (parsed && typeof parsed === 'object' && parsed.quote && typeof parsed.quote === 'object') {
      return { text: String(parsed.text ?? ''), quote: parsed.quote };
    }
  } catch (error) {
    return null;
  }
  return null;
}

export function parseFile(body) {
  try {
    const parsed = JSON.parse(String(body ?? ''));
    if (parsed && typeof parsed === 'object' && typeof parsed.file === 'string' && parsed.file !== '') {
      return {
        file: parsed.file,
        name: String(parsed.name ?? '文件'),
        size: Math.max(0, Number(parsed.size) || 0),
        dur: Math.max(0, Number(parsed.dur) || 0),
      };
    }
  } catch (error) {
    return null;
  }
  return null;
}

export function mediaKind(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name ?? ''));
  const ext = match === null ? '' : match[1].toLowerCase();
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga'].includes(ext)) {
    return 'audio';
  }
  return '';
}

export function quotePreview(quote) {
  const kind = String(quote.kind ?? 'text');
  if (kind === 'sticker') {
    return '[表情]';
  }
  if (kind === 'image') {
    return '[图片]';
  }
  if (kind === 'file') {
    try {
      const file = JSON.parse(String(quote.body ?? ''));
      return '[文件] ' + String(file.name ?? '');
    } catch (error) {
      return '[文件]';
    }
  }
  if (kind === 'merged') {
    try {
      const inner = JSON.parse(String(quote.body ?? ''));
      return '[聊天记录] ' + String(inner.title ?? '');
    } catch (error) {
      return '[聊天记录]';
    }
  }
  if (kind === 'quote') {
    return '[引用]';
  }
  if (kind === 'groupcard') {
    try {
      const inner = JSON.parse(String(quote.body ?? ''));
      return '[群名片] ' + String(inner.name ?? '');
    } catch (error) {
      return '[群名片]';
    }
  }
  const text = String(quote.body ?? '');
  return text.length > 60 ? text.slice(0, 60) + '…' : text;
}

export function renderBody(text, myNickname = '') {
  const raw = String(text ?? '');
  let html = '';
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match = TOKEN_RE.exec(raw);
  while (match !== null) {
    html += esc(raw.slice(last, match.index));
    if (match[1] !== undefined) {
      const svg = stickerByLabel(match[1]);
      html += svg === '' ? esc(match[0]) : '<span class="sticker-inline">' + svg + '</span>';
    } else if (match[2] !== undefined) {
      html += '<span class="mention' + (myNickname !== '' && match[2] === myNickname ? ' mention-me' : '') + '">@' + esc(match[2]) + '</span>';
    } else {
      const url = trimUrl(match[3]);
      html += '<a class="link-out" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' + esc(match[3].slice(url.length));
    }
    last = match.index + match[0].length;
    match = TOKEN_RE.exec(raw);
  }
  html += esc(raw.slice(last));
  return html;
}
