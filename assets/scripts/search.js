import { state } from './state.js';
import { esc, fmtListTime } from './util.js';
import { apiGet } from './api.js';
import * as messages from './messages.js';

let results = null;
let timer = 0;
let pending = '';

const KIND_LABEL = {
  text: '',
  image: '[图片]',
  csticker: '[表情]',
  sticker: '[表情]',
  file: '[文件]',
  voice: '[语音]',
  call: '[通话]',
  quote: '',
  merged: '[聊天记录]',
  poke: '[戳一戳]',
};

function mark(text, query) {
  const safe = esc(text);
  const needle = esc(query);
  if (needle === '') {
    return safe;
  }
  return safe.split(needle).join('<mark>' + needle + '</mark>');
}

function bodyText(item) {
  const label = KIND_LABEL[item.kind] ?? '';
  if (item.kind === 'text' || item.kind === 'quote') {
    return item.body;
  }
  return label === '' ? item.body : label;
}

function rowHtml(item, query) {
  const who = item.mine ? '我' : (item.sender ?? '');
  const head = esc(item.chat_title ?? '') + (item.is_group === true && who !== '' ? ' · ' + esc(who) : '');
  return '<div class="row search-msg-row" data-act="msg-jump" data-chat="' + item.chat_id + '" data-msg="' + item.id + '">' +
    '<span class="row-main">' +
      '<span class="row-name">' + head + '</span>' +
      '<span class="row-sub search-snippet">' + mark(bodyText(item), query) + '</span>' +
    '</span>' +
    '<span class="row-sub mono">' + esc(fmtListTime(item.created_at)) + '</span>' +
  '</div>';
}

function blockHtml() {
  const query = state.searchQuery.trim();
  if (query.length < 2) {
    return '';
  }
  let html = '<div class="list-head">聊天记录</div>';
  if (results === null) {
    html += '<p class="empty-note">搜索中…</p>';
  } else if (results.length === 0) {
    html += '<p class="empty-note">没有找到相关消息</p>';
  } else {
    html += results.map((item) => rowHtml(item, query)).join('');
  }
  return html;
}

function paint() {
  const body = document.getElementById('panel-body');
  if (body === null) {
    return;
  }
  const query = state.searchQuery.trim();
  let holder = body.querySelector('#msg-search-block');
  if (query.length < 2) {
    if (holder !== null) {
      holder.remove();
    }
    return;
  }
  if (holder === null) {
    holder = document.createElement('div');
    holder.id = 'msg-search-block';
    body.prepend(holder);
  } else if (body.firstElementChild !== holder) {
    body.prepend(holder);
  }
  holder.innerHTML = blockHtml();
}

function request(query) {
  pending = query;
  results = null;
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    if (state.searchQuery.trim() !== pending) {
      return;
    }
    try {
      const res = await apiGet('api/search.php', { q: pending });
      results = res.results ?? [];
    } catch (error) {
      results = [];
    }
    if (state.searchQuery.trim() === pending) {
      paint();
    }
  }, 300);
}

export function init() {
  $('#panel-search').addEventListener('input', (event) => {
    const query = String(event.target.value ?? '').trim();
    if (query.length < 2) {
      results = null;
      window.clearTimeout(timer);
      window.setTimeout(paint, 0);
      return;
    }
    request(query);
  });

  document.addEventListener('click', (event) => {
    const row = event.target.closest('[data-act="msg-jump"]');
    if (row === null) {
      return;
    }
    event.preventDefault();
    row.classList.add('is-active');
    messages.jumpTo(Number(row.dataset.chat), Number(row.dataset.msg)).catch(() => {});
  }, true);
}
