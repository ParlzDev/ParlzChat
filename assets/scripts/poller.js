import { state, emit, chatById, lastMessageId } from './state.js';
import { apiGet } from './api.js';
import { ping, systemNotify } from './notify.js';
import * as messages from './messages.js';
import * as chats from './chats.js';
import * as contacts from './contacts.js';
import { callFromPoll } from './call.js';
import { syncFromPoll as gcallFromPoll } from './gcall.js';

const INTERVAL = 1600;
let timer = null;
let reloading = false;

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

function notifyPreview(message) {
  const name = message.author && message.author.nickname ? message.author.nickname : '新消息';
  const kind = message.kind;
  const body = kind === 'sticker'
    ? '[表情]'
    : kind === 'image'
      ? '[图片]'
      : kind === 'voice'
        ? '[语音]'
        : kind === 'file'
          ? '[文件]'
          : kind === 'merged'
            ? '[聊天记录]'
            : String(message.body ?? '').slice(0, 80);
  return name + '：' + body;
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
      const incoming = (res.messages ?? []).filter((message) => state.user !== null && message.user_id !== state.user.id);
      messages.merge(res.messages);
      if (incoming.length > 0) {
        ping();
        if (document.hidden) {
          const title = state.activeChat ? state.activeChat.title : 'Parlz';
          systemNotify(title, notifyPreview(incoming[incoming.length - 1]));
        }
      }
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
