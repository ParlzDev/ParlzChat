import { state, emit, chatById, lastMessageId, totalUnread } from './state.js';
import { apiGet } from './api.js';
import { ping, systemNotify, notifyTarget } from './notify.js';
import { avatarUrl } from './util.js';
import * as messages from './messages.js';
import * as chats from './chats.js';
import * as contacts from './contacts.js';
import * as notice from './notice.js';
import { callFromPoll } from './call.js';
import { syncFromPoll as gcallFromPoll } from './gcall.js';

const INTERVAL = 1600;
let timer = null;
let reloading = false;
let seenLast = new Map();
let seenUser = 0;

function previewOf(last) {
  const kind = String(last.kind ?? 'text');
  if (kind === 'sticker' || kind === 'csticker') {
    return '[表情]';
  }
  if (kind === 'image') {
    return '[图片]';
  }
  if (kind === 'voice') {
    return '[语音]';
  }
  if (kind === 'merged') {
    return '[聊天记录]';
  }
  if (kind === 'groupcard') {
    return '[群名片]';
  }
  if (kind === 'call') {
    return '[通话]';
  }
  if (kind === 'file') {
    try {
      const file = JSON.parse(String(last.body ?? ''));
      return '[文件] ' + String(file.name ?? '');
    } catch (error) {
      return '[文件]';
    }
  }
  if (kind === 'quote') {
    try {
      const inner = JSON.parse(String(last.body ?? ''));
      return String(inner.text ?? '[引用]');
    } catch (error) {
      return '[引用]';
    }
  }
  const body = String(last.body ?? '');
  return body.length > 60 ? body.slice(0, 60) + '…' : body;
}

function watchIncoming(list) {
  const me = state.user === null ? 0 : Number(state.user.id);
  if (me !== seenUser) {
    seenUser = me;
    seenLast = new Map();
    notice.clear();
  }
  if (me === 0) {
    return;
  }
  let missed = 0;
  for (const chat of list) {
    const last = chat.last ?? null;
    const lastId = last === null ? 0 : Number(last.id);
    const prev = seenLast.get(chat.id);
    seenLast.set(chat.id, lastId);
    if (prev === undefined || lastId <= prev) {
      continue;
    }
    if (last === null || Number(last.user_id) === me || String(last.kind) === 'recalled' || chat.muted === true) {
      continue;
    }
    const isActive = state.activeChat !== null && Number(state.activeChat.id) === Number(chat.id);
    const hidden = document.hidden;
    if (isActive && hidden === false && document.hasFocus()) {
      missed += 1;
      continue;
    }
    missed += 1;
    const channel = notifyTarget();
    const osReady = channel !== 'web' || (typeof window.Notification === 'function' && window.Notification.permission === 'granted');
    if (hidden || osReady) {
      systemNotify(chat.title, previewOf(last), totalUnread(), {
        chatId: Number(chat.id),
        avatar: chat.avatar === '' || chat.avatar === undefined || chat.avatar === null ? '' : avatarUrl(chat.avatar),
      });
    } else {
      notice.push(chat, previewOf(last));
    }
  }
  if (missed > 0) {
    ping();
  }
}

function maybeReload(build) {
  if (reloading || typeof build !== 'string' || build === '') {
    return;
  }
  const boot = window.PARLZ_BOOT ?? {};
  if (boot.build === build) {
    return;
  }
  const layer = document.getElementById('call-layer');
  if (layer !== null && !layer.classList.contains('is-hidden')) {
    return;
  }
  const input = document.getElementById('composer-input');
  if (input !== null && input.value.trim() !== '') {
    return;
  }
  reloading = true;
  window.location.reload();
}

function applyChats(list) {
  state.chats = list;
  if (state.activeChat) {
    const fresh = chatById(state.activeChat.id);
    if (fresh === null) {
      state.activeChat = null;
      chats.closePane();
      state.messages = [];
      messages.clear();
    } else {
      state.activeChat = fresh;
    }
  }
  emit('chats');
}

async function tick() {
  if (state.user === null) {
    if (seenUser !== 0) {
      seenUser = 0;
      seenLast = new Map();
      notice.clear();
    }
    return;
  }
  const chatId = state.activeChat ? state.activeChat.id : 0;
  try {
    const res = await apiGet('api/poll.php', {
      chat_id: chatId,
      after: chatId > 0 ? lastMessageId() : 0,
      typing: state.composerTyping ? 1 : 0,
    });
    applyChats(res.chats);
    watchIncoming(res.chats ?? []);
    maybeReload(res.build);
    callFromPoll(res.call ?? null);
    gcallFromPoll(res.gcalls ?? []);
    if (res.requests !== state.requests.length) {
      contacts.refresh().catch(() => {});
    }
    if (chatId > 0 && state.activeChat && state.activeChat.id === chatId) {
      state.typingIds = res.typing;
      state.onlineIds = res.online;
      state.onlineStatus = res.status ?? {};
      chats.renderHead();
      messages.markRecalled(res.recalled ?? []);
      messages.merge(res.messages);
    }
  } catch (error) {
    if (error.status === 401) {
      window.location.reload();
    }
  }
}

export function start() {
  stop();
  timer = window.setInterval(tick, INTERVAL);
  document.addEventListener('visibilitychange', onVisible);
  tick();
}

export function stop() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  document.removeEventListener('visibilitychange', onVisible);
}

function onVisible() {
  if (!document.hidden) {
    tick();
  }
}
