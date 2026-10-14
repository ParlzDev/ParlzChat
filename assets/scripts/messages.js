import { state, chatById, on, emit } from './state.js';
import { $, esc, avatarHtml, fmtMsgTime, uploadUrl, uidUserId, toast, fmtSize, downloadFile, loadingHtml } from './util.js';
import { apiGet, apiPost } from './api.js';
import { stickerSvg } from './stickers.js';
import { levelChips } from './level.js';
import { renderBody, firstUrl, parseQuote, quotePreview, parseFile, mediaKind, parseGroupCard } from './richtext.js';
import { parseRecord, openRecordFromBody } from './record.js';
import { mediaUpgrade } from './media.js';
import { icon } from './icons.js';
import * as chats from './chats.js';

const TIME_GAP_SECONDS = 300;
const voiceTexts = new Map();
const sttPending = new Set();

function nearBottom(host) {
  return host.scrollHeight - host.scrollTop - host.clientHeight < 120;
}

function scrollToBottom() {
  const host = $('#chat-body');
  host.scrollTop = host.scrollHeight;
}

const cardCache = new Map();

async function attachCard(host, url) {
  if (url === '') {
    return;
  }
  if (cardCache.get(url) === null) {
    return;
  }
  const node = document.createElement('a');
  node.className = 'link-card is-loading';
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  node.textContent = url;
  host.appendChild(node);

  let card = cardCache.get(url);
  if (card === undefined) {
    try {
      const res = await apiGet('api/link.php', { url });
      card = res.card ?? null;
    } catch {
      card = null;
    }
    cardCache.set(url, card);
  }
  if (card === null) {
    node.remove();
    return;
  }
  node.classList.remove('is-loading');
  node.innerHTML =
    (card.image ? '<img class="link-card-thumb" src="' + esc(card.image) + '" alt="" loading="lazy">' : '') +
    '<span class="link-card-body">' +
      '<span class="link-card-title">' + esc(card.title || card.host || url) + '</span>' +
      (card.description ? '<span class="link-card-desc">' + esc(card.description) + '</span>' : '') +
      '<span class="link-card-site mono">' + esc(card.site || card.host || '') + '</span>' +
    '</span>';
}

function mergedPreview(item) {
  if (item.kind === 'image' || item.kind === 'csticker') {
    return item.kind === 'csticker' ? '[表情]' : '[图片]';
  }
  if (item.kind === 'groupcard') {
    return '[群名片]';
  }
  if (item.kind === 'sticker') {
    return '[表情]';
  }
  if (item.kind === 'voice') {
    return '[语音]';
  }
  if (item.kind === 'file') {
    const file = parseFile(item.body);
    return file === null ? '[文件]' : '[文件] ' + file.name;
  }
  if (item.kind === 'merged') {
    const inner = parseRecord(item.body);
    return '[聊天记录] ' + (inner === null ? '' : inner.title);
  }
  if (item.kind === 'quote') {
    const data = parseQuote(item.body);
    return data === null ? '[引用]' : data.text;
  }
  const text = String(item.body ?? '');
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
}

function voiceBubble(message, myNick) {
  const data = parseFile(message.body);
  if (data === null) {
    return '<div class="bubble">' + renderBody(message.body, myNick) + '</div>';
  }
  const dur = Math.max(1, Math.min(600, Number(data.dur) || Math.max(1, Math.round(data.size / 2000))));
  return '<div class="mplayer" data-media="voice" data-src="' + esc(uploadUrl(data.file)) + '"' +
    ' data-file="' + esc(data.file) + '" data-name="' + esc(data.name) + '" data-dur="' + dur + '"></div>' +
    voiceTextNode(message.id);
}

function voiceTextNode(messageId) {
  const text = voiceTexts.get(messageId);
  if (text === undefined) {
    return '';
  }
  return '<p class="voice-text">' + esc(text === '' ? '（没听清）' : text) + '</p>';
}

function voiceTextHost(messageId) {
  const row = document.querySelector('[data-msg="' + messageId + '"]');
  return row === null ? null : row.querySelector('.msg-main');
}

export async function transcribe(message) {
  if (!message || message.kind !== 'voice') {
    return;
  }
  if (voiceTexts.has(message.id) || sttPending.has(message.id)) {
    return;
  }
  sttPending.add(message.id);
  const host = voiceTextHost(message.id);
  if (host !== null) {
    const mark = document.createElement('div');
    mark.className = 'voice-text is-pending';
    mark.innerHTML = loadingHtml('转换中', true);
    host.appendChild(mark);
  }
  try {
    const res = await apiPost('api/stt.php', { message_id: message.id });
    const text = String(res.text ?? '').trim();
    voiceTexts.set(message.id, text);
    const live = voiceTextHost(message.id);
    if (live !== null) {
      const node = live.querySelector('.voice-text');
      if (node === null) {
        live.insertAdjacentHTML('beforeend', voiceTextNode(message.id));
      } else {
        node.classList.remove('is-pending');
        node.textContent = text === '' ? '（没听清）' : text;
      }
    }
  } catch (error) {
    const live = voiceTextHost(message.id);
    const node = live === null ? null : live.querySelector('.voice-text.is-pending');
    if (node !== null) {
      node.remove();
    }
    toast(error.message, true);
  } finally {
    sttPending.delete(message.id);
  }
}

function fileBubble(message, myNick) {
  const data = parseFile(message.body);
  if (data === null) {
    return '<div class="bubble">' + renderBody(message.body, myNick) + '</div>';
  }
  const media = mediaKind(data.name);
  if (media !== '') {
    return '<div class="mplayer" data-media="' + media + '" data-src="' + esc(uploadUrl(data.file)) + '"' +
      ' data-file="' + esc(data.file) + '" data-name="' + esc(data.name) + '"' +
      ' data-size="' + esc(fmtSize(data.size)) + '"></div>';
  }
  return '<div class="file-bubble" data-file="' + esc(data.file) + '" data-name="' + esc(data.name) + '" title="下载文件">' +
    icon('file') +
    '<span class="file-body"><span class="file-name">' + esc(data.name) + '</span>' +
    '<span class="file-size">' + fmtSize(data.size) + '</span></span>' +
    '</div>';
}

function mergedCard(message) {
  const data = parseRecord(message.body);
  const items = data === null ? [] : data.items;
  const title = data === null ? '聊天记录' : data.title;
  const preview = items.slice(0, 3).map((item) => esc(item.name) + '：' + esc(mergedPreview(item))).join('\n');
  const hint = window.matchMedia('(max-width: 900px)').matches ? '点击查看' : '新窗口打开';
  return '<button type="button" class="merged-card" data-merged="' + message.id + '" title="' + hint + '">' +
    '<span class="merged-head">' + esc(title) + '</span>' +
    (preview === '' ? '' : '<span class="merged-preview">' + preview + '</span>') +
    '<span class="merged-foot">' + items.length + ' 条消息 · ' + hint + '</span>' +
    '</button>';
}

function groupCard(message) {
  const data = parseGroupCard(message.body);
  if (data === null) {
    return '<div class="bubble">' + renderBody(message.body) + '</div>';
  }
  return '<div class="group-card" role="button" tabindex="0" data-group-card="' + data.chatId + '">' +
    avatarHtml({ id: data.chatId, nickname: data.name, avatar: data.avatar }, 'avatar-sm') +
    '<span class="group-card-main">' +
    '<span class="group-card-name">' + esc(data.name) + '</span>' +
    '<span class="group-card-sub mono">' + esc(data.uid) + ' · ' + data.members + ' 人</span></span>' +
    '<span class="group-card-tag">群名片</span></div>';
}

function quoteNode(message, myNick) {
  const data = parseQuote(message.body);
  if (data === null) {
    return '<div class="bubble">' + renderBody(message.body, myNick) + '</div>';
  }
  return '<div class="quote-wrap">' +
    '<button type="button" class="quote-card" data-quote="' + Math.max(0, Number(data.quote.id) || 0) + '">' +
    '<span class="quote-name">' + esc(data.quote.name ?? '') + '</span>' +
    '<span class="quote-text">' + esc(quotePreview(data.quote)) + '</span>' +
    '</button>' +
    '<div class="bubble">' + renderBody(data.text, myNick) + '</div>' +
    '</div>';
}

function callRecordHtml(body, mine) {
  let data = null;
  try {
    data = JSON.parse(body);
  } catch (error) {
    data = null;
  }
  if (data === null || typeof data !== 'object') {
    return '<span class="msg-call-text">通话记录</span>';
  }
  const seconds = Math.max(0, Number(data.duration) || 0);
  const clock = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  const labels = {
    ended: '通话时长 ' + clock,
    declined: mine ? '对方已拒绝' : '已拒绝',
    canceled: mine ? '已取消' : '对方已取消',
    missed: mine ? '对方未接听' : '未接来电',
  };
  const text = labels[data.status] === undefined ? '通话已结束' : labels[data.status];
  const name = data.kind === 'video' ? '视频通话' : '语音通话';
  return '<span class="msg-call-icon">' + icon(data.kind === 'video' ? 'video' : 'phone') + '</span>' +
    '<span class="msg-call-text">' + esc(name) + ' · ' + esc(text) + '</span>';
}

function messageNode(message) {
  const mine = state.user !== null && message.user_id === state.user.id;
  const chat = state.activeChat;
  const row = document.createElement('div');
  row.className = mine ? 'msg msg-mine' : 'msg';
  row.dataset.msg = String(message.id);

  if (message.kind === 'system') {
    row.className = 'msg-system';
    row.textContent = message.body;
    return row;
  }

  if (message.kind === 'recalled') {
    row.className = 'msg-recall';
    row.textContent = (mine ? '你' : message.author.nickname) + ' 撤回了一条消息';
    return row;
  }

  if (message.kind === 'poke') {
    row.className = 'msg-recall msg-poke';
    row.textContent = message.body;
    return row;
  }

  if (message.kind === 'call') {
    row.className = 'msg-recall msg-call';
    row.innerHTML = callRecordHtml(message.body, mine);
    return row;
  }

  const picked = state.selectMode && state.selected.includes(message.id);
  if (state.selectMode) {
    row.classList.add('is-selectable');
    if (picked) {
      row.classList.add('is-picked');
    }
  }
  const pick = state.selectMode ? '<span class="pick' + (picked ? ' is-on' : '') + '"></span>' : '';

  const showName = !mine && chat !== null && chat.type === 'group';
  const avatar = avatarHtml(message.author, 'avatar-sm', false, true);
  const name = showName ? '<span class="msg-name">' + esc(message.author.nickname) + levelChips(message.author.level) + '</span>' : '';
  const myNick = chat !== null && chat.my_nick ? String(chat.my_nick) : (state.user ? state.user.nickname : '');
  const content = message.kind === 'image'
    ? '<div class="image-bubble"><img src="' + esc(uploadUrl(message.body)) + '" alt="图片" loading="lazy"></div>'
    : message.kind === 'sticker'
      ? '<div class="sticker-bubble">' + (stickerSvg(message.body) || esc(message.body)) + '</div>'
      : message.kind === 'csticker'
        ? '<div class="sticker-bubble is-custom"><img class="csticker-img" src="' + esc(uploadUrl(message.body)) + '" alt="表情" loading="lazy"></div>'
        : message.kind === 'merged'
        ? mergedCard(message)
        : message.kind === 'groupcard'
          ? groupCard(message)
          : message.kind === 'quote'
          ? quoteNode(message, myNick)
          : message.kind === 'file'
            ? fileBubble(message, myNick)
            : message.kind === 'voice'
              ? voiceBubble(message, myNick)
              : '<div class="bubble">' + renderBody(message.body, myNick) + '</div>';
  row.innerHTML = pick + avatar +
    '<div class="msg-main">' + name + content +
    '</div>';
  const host = row.querySelector('.msg-main');
  if (message.kind === 'text' && host !== null) {
    attachCard(host, firstUrl(message.body));
  }
  return row;
}

export function showLoading(label = '加载中') {
  const host = $('#chat-body');
  if (host !== null) {
    host.innerHTML = loadingHtml(label);
  }
}

function timeSepNode(ts) {
  const node = document.createElement('div');
  node.className = 'time-sep';
  node.textContent = fmtMsgTime(ts);
  return node;
}

function loadMoreNode() {
  const node = document.createElement('div');
  node.className = 'load-more-hint';
  node.innerHTML = loadingHtml('加载中', true);
  return node;
}

let loadingOlder = false;

function loadOlder() {
  const chat = state.activeChat;
  if (!chat || state.messages.length === 0 || loadingOlder || !state.hasMore) {
    return;
  }
  loadingOlder = true;
  const first = state.messages[0].id;
  render(true);
  apiGet('api/messages.php', { chat_id: chat.id, before: first })
    .then((res) => {
      loadingOlder = false;
      if (!state.activeChat || state.activeChat.id !== chat.id) {
        return;
      }
      state.messages = res.messages.concat(state.messages);
      state.hasMore = res.has_more;
      render(true);
    })
    .catch((error) => {
      loadingOlder = false;
      toast(error.message, true);
      render(true);
    });
}

function maybeLoadOlder(auto) {
  const host = $('#chat-body');
  if (!state.hasMore || loadingOlder || state.messages.length === 0) {
    return;
  }
  if (auto === true || host.scrollTop < 90) {
    loadOlder();
  }
}

let pendingNew = 0;

function updateToBottom() {
  const button = $('#to-bottom');
  if (button === null) {
    return;
  }
  const host = $('#chat-body');
  const away = host.scrollHeight - host.scrollTop - host.clientHeight >= 120;
  if (away && pendingNew > 0) {
    button.classList.remove('is-hidden');
    const counter = $('#to-bottom-n');
    if (counter !== null) {
      counter.textContent = pendingNew > 99 ? '99+' : String(pendingNew);
    }
  } else {
    button.classList.add('is-hidden');
  }
}

export function clear() {
  $('#chat-body').innerHTML = '';
  pendingNew = 0;
  updateToBottom();
}

export function render(keepScroll) {
  const host = $('#chat-body');
  const stick = keepScroll !== true && nearBottom(host);
  const prevHeight = host.scrollHeight;
  const prevTop = host.scrollTop;

  host.innerHTML = '';
  if (loadingOlder) {
    host.appendChild(loadMoreNode());
  }
  let previousAt = null;
  state.messages.forEach((message) => {
    if (previousAt === null || message.created_at - previousAt > TIME_GAP_SECONDS) {
      host.appendChild(timeSepNode(message.created_at));
    }
    previousAt = message.created_at;
    host.appendChild(messageNode(message));
  });

  if (keepScroll === true) {
    host.scrollTop = host.scrollHeight - prevHeight + prevTop;
  } else if (stick) {
    scrollToBottom();
  }
  mediaUpgrade(host);
  if (state.hasMore && state.messages.length > 0 && host.scrollHeight <= host.clientHeight + 40) {
    window.setTimeout(() => maybeLoadOlder(true), 30);
  }
}

export function merge(incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return;
  }
  const seen = new Set(state.messages.map((message) => message.id));
  let added = 0;
  let mine = false;
  incoming.forEach((message) => {
    if (!seen.has(message.id)) {
      state.messages.push(message);
      seen.add(message.id);
      added++;
      if (state.user !== null && message.user_id === state.user.id) {
        mine = true;
      }
    }
  });
  if (added === 0) {
    return;
  }
  state.messages.sort((a, b) => a.id - b.id);
  const host = $('#chat-body');
  const away = host.scrollHeight - host.scrollTop - host.clientHeight >= 120;
  render(false);
  if (mine) {
    scrollToBottom();
    pendingNew = 0;
  } else if (away) {
    pendingNew += added;
  }
  updateToBottom();
  chats.markRead();
}

export function currentChat() {
  return chatById(state.activeChat ? state.activeChat.id : 0);
}

export function markRecalled(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return;
  }
  const targets = new Set(ids.map((id) => Number(id)));
  let changed = false;
  state.messages.forEach((message) => {
    if (targets.has(message.id) && message.kind !== 'recalled') {
      message.kind = 'recalled';
      message.body = '';
      changed = true;
    }
  });
  if (changed) {
    render(true);
  }
}

export function messageById(id) {
  const target = Number(id);
  return state.messages.find((message) => message.id === target) ?? null;
}

function flashMessage(node) {
  node.classList.remove('msg-flash');
  void node.offsetWidth;
  node.classList.add('msg-flash');
  window.setTimeout(() => node.classList.remove('msg-flash'), 3000);
}

export async function focusMessage(messageId) {
  const chat = state.activeChat;
  if (chat === null || messageId <= 0) {
    return;
  }
  let row = $('#chat-body').querySelector('[data-msg="' + messageId + '"]');
  if (row === null) {
    try {
      const res = await apiGet('api/messages.php', { chat_id: chat.id, before: messageId + 1 });
      state.messages = res.messages ?? [];
      state.hasMore = res.has_more !== false;
      render(false);
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    } catch (error) {
      return;
    }
    row = $('#chat-body').querySelector('[data-msg="' + messageId + '"]');
  }
  if (row === null) {
    return;
  }
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  flashMessage(row);
}

export async function jumpTo(chatId, messageId) {
  if (messageId <= 0) {
    return;
  }
  if (state.activeChat === null || state.activeChat.id !== chatId) {
    if (chatId <= 0) {
      return;
    }
    await chats.open(chatId);
  }
  await focusMessage(messageId);
}

function updateSelectBar() {
  const bar = $('#select-bar');
  if (bar === null) {
    return;
  }
  bar.classList.toggle('is-hidden', !state.selectMode);
  $('#composer').classList.toggle('is-hidden', state.selectMode);
  const count = $('#select-count');
  if (count !== null) {
    count.textContent = '已选 ' + state.selected.length + ' 条';
  }
  const forward = $('#select-forward');
  if (forward !== null) {
    forward.disabled = state.selected.length === 0;
  }
}

export function setSelectMode(on) {
  state.selectMode = Boolean(on);
  state.selected = [];
  updateSelectBar();
  render(true);
}

export function toggleSelect(id) {
  const target = Number(id);
  const index = state.selected.indexOf(target);
  if (index === -1) {
    state.selected.push(target);
  } else {
    state.selected.splice(index, 1);
  }
  updateSelectBar();
  render(true);
}

export function selectedIds() {
  return state.selected.slice();
}

export function init() {
  $('#select-cancel').addEventListener('click', () => setSelectMode(false));
  $('#select-forward').addEventListener('click', () => {
    if (state.selected.length === 0) {
      toast('先点要转发的消息', true);
      return;
    }
    emit('forward', state.selected.slice());
  });

  $('#chat-body').addEventListener('scroll', () => {
    maybeLoadOlder(false);
    if (nearBottom($('#chat-body'))) {
      pendingNew = 0;
    }
    updateToBottom();
  });

  $('#chat-body').addEventListener('dblclick', (event) => {
    const avatar = event.target.closest('.avatar[data-user]');
    const chat = state.activeChat;
    if (avatar === null || chat === null || state.user === null) {
      return;
    }
    const targetId = Number(avatar.dataset.user);
    if (targetId <= 0 || targetId === state.user.id) {
      return;
    }
    apiPost('api/messages.php', { action: 'poke', chat_id: chat.id, user_id: targetId })
      .then((res) => {
        merge([res.message]);
      })
      .catch((error) => toast(error.message, true));
  });

  const toBottom = $('#to-bottom');
  if (toBottom !== null) {
    toBottom.addEventListener('click', () => {
      pendingNew = 0;
      scrollToBottom();
      updateToBottom();
    });
  }

  document.addEventListener('click', (event) => {
    const fileCard = event.target.closest('.media-dl, .file-bubble');
    if (fileCard !== null) {
      downloadFile(uploadUrl(fileCard.dataset.file), fileCard.dataset.name ?? '文件');
      return;
    }
    const quoteCard = event.target.closest('[data-quote]');
    if (quoteCard !== null) {
      const id = Number(quoteCard.dataset.quote);
      if (id > 0) {
        jumpTo(state.activeChat === null ? 0 : state.activeChat.id, id).catch(() => {});
      }
      return;
    }
    const gcard = event.target.closest('[data-group-card]');
    if (gcard !== null) {
      const groupId = Number(gcard.dataset.groupCard);
      if (chatById(groupId) !== null) {
        emit('open-chat', groupId);
        return;
      }
      import('./drawer.js')
        .then(({ openGroupCard }) => openGroupCard(groupId))
        .catch(() => toast('打不开这张群名片', true));
      return;
    }
    const card = event.target.closest('[data-merged]');
    if (card === null) {
      return;
    }
    const message = messageById(Number(card.dataset.merged));
    if (message === null) {
      return;
    }
    const popup = openRecordFromBody(message.body);
    if (popup === null) {
      toast('这条聊天记录读不出来', true);
    }
  });

  $('#chat-body').addEventListener('click', (event) => {
    if (!state.selectMode) {
      return;
    }
    const row = event.target.closest('[data-msg]');
    if (row === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleSelect(Number(row.dataset.msg));
  }, true);
}

on('active', () => {
  if (state.selectMode) {
    setSelectMode(false);
  }
});
