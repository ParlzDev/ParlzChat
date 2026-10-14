import { state, emit, on, chatById, lastMessageId } from './state.js';
import { $, esc, fmtListTime, avatarHtml, toast, paintPanel, panelView, uploadUrl } from './util.js';
import { apiGet, apiPost } from './api.js';
import { icon } from './icons.js';
import { parseQuote } from './richtext.js';
import * as router from './router.js';
import * as messages from './messages.js';
import * as composer from './composer.js';
import * as drawer from './drawer.js';
import * as gcall from './gcall.js';

let readSentId = 0;
let readSentAt = 0;

function matches(chat) {
  const query = state.searchQuery.trim().toLowerCase();
  if (query === '') {
    return true;
  }
  return chat.title.toLowerCase().includes(query);
}

function previewOf(chat) {
  if (!chat.last) {
    return '还没有消息';
  }
  if (chat.last.kind === 'system' || chat.last.kind === 'recalled') {
    return chat.last.kind === 'recalled' ? '撤回了一条消息' : chat.last.body;
  }
  const body = chat.last.kind === 'sticker'
    ? '[表情]'
    : chat.last.kind === 'csticker'
      ? '[表情]'
      : chat.last.kind === 'call'
        ? callLine(chat.last.body)
        : chat.last.kind === 'image'
          ? '[图片]'
      : chat.last.kind === 'file'
        ? '[文件]'
        : chat.last.kind === 'voice'
          ? '[语音]'
          : chat.last.kind === 'merged'
            ? '[聊天记录]'
            : chat.last.kind === 'groupcard'
              ? '[群名片]'
              : chat.last.kind === 'quote'
              ? quoteLine(chat.last.body)
              : (chat.last.body.length > 46 ? chat.last.body.slice(0, 46) + '…' : chat.last.body);
  if (chat.type === 'group' && chat.last.user_id !== (state.user ? state.user.id : 0)) {
    return chat.last.user_name + '：' + body;
  }
  return body;
}

function callLine(body) {
  let data = null;
  try {
    data = JSON.parse(body);
  } catch (error) {
    data = null;
  }
  if (data === null || typeof data !== 'object') {
    return '[通话]';
  }
  const name = data.kind === 'video' ? '[视频通话]' : '[语音通话]';
  const labels = {
    ended: '通话时长 ' + clockText(Number(data.duration) || 0),
    declined: '已拒绝',
    canceled: '已取消',
    missed: '未接听',
  };
  return name + ' ' + (labels[data.status] === undefined ? '' : labels[data.status]);
}

function clockText(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
}

function quoteLine(body) {
  const data = parseQuote(body);
  if (data === null) {
    return '[引用]';
  }
  const name = data.quote && data.quote.name ? String(data.quote.name) : '对方';
  const line = '[引用' + name + '的消息]' + data.text;
  return line.length > 46 ? line.slice(0, 46) + '…' : line;
}

function convHtml(chat) {
  const active = state.activeChat && state.activeChat.id === chat.id;
  const badge = chat.unread > 0
    ? (chat.muted
      ? '<span class="badge badge-dot"></span>'
      : '<span class="badge">' + (chat.unread > 99 ? '99+' : chat.unread) + '</span>')
    : '';
  const isDm = chat.type === 'dm';
  const isSelf = chat.type === 'self';
  const showDot = isDm || isSelf;
  const pinMark = chat.pinned ? '<span class="pin-mark" title="置顶">' + icon('pin') + '</span>' : '';
  const mentionTag = chat.mentioned ? '<span class="mention-tag">[有人@我]</span>' : '';
  const inGroupCall = chat.type === 'group'
    && (state.groupCalls ?? []).some((item) => Number(item.chat_id) === Number(chat.id));
  const callMark = inGroupCall ? '<span class="gcall-mark" title="群语音通话中">' + icon('phone') + '</span>' : '';
  return '<button type="button" class="conv' + (active ? ' is-active' : '') + (chat.pinned ? ' is-pinned' : '') + '" data-chat="' + chat.id + '">' +
    avatarHtml({ id: showDot ? chat.avatar_user : chat.id, nickname: chat.title, avatar: chat.avatar, status: chat.status ?? '' }, '', showDot && chat.online === true, showDot) +
    '<span class="conv-main">' +
      '<span class="conv-top"><span class="conv-name">' + esc(chat.title) + '</span>' + pinMark + callMark +
      '<span class="conv-time mono">' + fmtListTime(chat.last ? chat.last.created_at : 0) + '</span></span>' +
      '<span class="conv-bottom">' + mentionTag + '<span class="conv-preview">' + esc(previewOf(chat)) + '</span>' + badge + '</span>' +
    '</span>' +
    '</button>';
}

let renderedHtml = null;

export function render() {
  let html = '';
  if (state.chats.length === 0) {
    html = '<p class="empty-note">还没有会话，点右上角 + 找到好友开始聊天</p>';
  } else {
    const list = state.chats.filter(matches);
    html = list.length === 0 ? '<p class="empty-note">没有匹配的会话</p>' : list.map(convHtml).join('');
  }
  if (html === renderedHtml && panelView() === 'chats') {
    return;
  }
  renderedHtml = html;
  paintPanel('chats', html);
}

export async function refresh() {
  const res = await apiGet('api/chats.php');
  state.chats = res.chats;
  if (state.activeChat) {
    const fresh = chatById(state.activeChat.id);
    if (fresh) {
      state.activeChat = fresh;
    }
  }
  emit('chats');
  renderHead();
}

export function markRead() {
  const chat = state.activeChat;
  if (!chat) {
    return;
  }
  const last = lastMessageId();
  const now = Date.now();
  if (last <= readSentId || now - readSentAt < 1200) {
    return;
  }
  readSentId = last;
  readSentAt = now;
  chat.unread = 0;
  emit('chats');
  apiPost('api/chats.php', { action: 'read', chat_id: chat.id, last_id: last }).catch(() => {});
}

const STATUS_LABEL = { online: '在线', dnd: '勿扰', away: '离开' };

function dmStatus(chat, online) {
  const live = state.onlineStatus[String(chat.avatar_user)] ?? '';
  if (live !== '') {
    return live;
  }
  if (chat.status !== undefined && chat.status !== '') {
    return String(chat.status);
  }
  return online ? 'online' : '';
}

function renderNotice(chat) {
  const node = $('#chat-notice');
  if (node === null) {
    return;
  }
  const notice = chat !== null && chat.type === 'group' ? String(chat.notice ?? '').trim() : '';
  if (notice === '') {
    node.classList.add('is-hidden');
    node.textContent = '';
    return;
  }
  node.classList.remove('is-hidden');
  node.textContent = '公告：' + notice;
}

function applyChatBg(chat) {
  const body = $('#chat-body');
  if (body === null) {
    return;
  }
  const bg = chat !== null ? String(chat.bg ?? '') : '';
  if (bg === '') {
    body.style.backgroundImage = '';
    body.classList.remove('has-bg');
    return;
  }
  body.style.backgroundImage = 'url(' + uploadUrl(bg) + ')';
  body.classList.add('has-bg');
}

let headAvatarCache = null;
let headActionsCache = null;
let headNoticeChat = null;

export function renderHead() {
  const chat = state.activeChat;
  const titleNode = $('#chat-title');
  const subNode = $('#chat-sub');
  const actions = $('#chat-head-actions');
  const avatarSlot = $('#chat-head-avatar');
  if (!chat) {
    titleNode.textContent = '';
    subNode.textContent = '';
    actions.innerHTML = '';
    if (avatarSlot) {
      avatarSlot.innerHTML = '';
    }
    headAvatarCache = null;
    headActionsCache = null;
    headNoticeChat = null;
    renderNotice(null);
    applyChatBg(null);
    return;
  }
  if (headNoticeChat === null || headNoticeChat.id !== chat.id || headNoticeChat.notice !== chat.notice || headNoticeChat.bg !== chat.bg) {
    renderNotice(chat);
    applyChatBg(chat);
    headNoticeChat = { id: chat.id, notice: chat.notice, bg: chat.bg };
  }
  const isGroup = chat.type === 'group';
  const online = chat.avatar_user > 0 && state.onlineIds.includes(chat.avatar_user);
  const status = isGroup ? '' : dmStatus(chat, online);
  const titleText = isGroup ? chat.title + '（' + chat.members + '）' : chat.title;
  let subText = STATUS_LABEL[status] ?? '离线';
  if (state.typingIds.length > 0) {
    subText = isGroup ? '有人正在输入…' : '对方正在输入…';
  } else if (isGroup) {
    const onlineCount = state.onlineIds.length;
    subText = onlineCount > 0 ? '群聊 · ' + chat.members + ' 人 · ' + onlineCount + ' 人在线' : '群聊 · ' + chat.members + ' 人';
  }
  if (titleNode.textContent !== titleText) {
    titleNode.textContent = titleText;
  }
  if (subNode.textContent !== subText) {
    subNode.textContent = subText;
  }
  const avatarMarkup = isGroup
    ? avatarHtml({ id: chat.id, nickname: chat.title, avatar: chat.avatar ?? '' }, 'avatar-sm', false, false)
    : avatarHtml({ id: chat.avatar_user, nickname: chat.title, avatar: chat.avatar, status }, 'avatar-sm', online, true);
  if (avatarSlot && headAvatarCache !== avatarMarkup) {
    headAvatarCache = avatarMarkup;
    avatarSlot.innerHTML = avatarMarkup;
  }
  const callable = !isGroup && chat.type === 'dm' && chat.avatar_user > 0;
  const onAir = isGroup && (gcall.inThisChat(chat.id)
    || (state.groupCalls ?? []).some((item) => Number(item.chat_id) === Number(chat.id)));
  const actionsMarkup = (callable
    ? '<button type="button" class="icon-btn" id="chat-call-audio" title="语音通话">' + icon('phone') + '</button>' +
      '<button type="button" class="icon-btn" id="chat-call-video" title="视频通话">' + icon('video') + '</button>'
    : '') +
    (isGroup
      ? '<button type="button" class="icon-btn' + (onAir ? ' is-on' : '') + '" id="chat-gcall" title="' + (onAir ? '群语音通话中' : '发起群语音通话') + '">' + icon('phone') + '</button>'
      : '') +
    '<button type="button" class="icon-btn" id="chat-info-btn" title="' + (isGroup ? '群信息' : '对方资料') + '">' + icon('info') + '</button>';
  if (headActionsCache !== actionsMarkup) {
    headActionsCache = actionsMarkup;
    actions.innerHTML = actionsMarkup;
  }
}

export function showPane(open = true) {
  $('#chat-head').classList.remove('is-hidden');
  $('#chat-empty').classList.add('is-hidden');
  $('#chat-body').classList.remove('is-hidden');
  $('#composer').classList.remove('is-hidden');
  if (open) {
    $('#chat').classList.add('is-open');
    $('#app').classList.add('chat-open');
  } else {
    $('#chat').classList.remove('is-open');
    $('#app').classList.remove('chat-open');
  }
}

export function closePane() {
  $('#chat').classList.remove('is-open');
  $('#app').classList.remove('chat-open');
  const route = router.current();
  if (route.name === 'chat' && route.uid !== '') {
    router.replace('chat', 0, '');
  }
}

export async function open(chatId) {
  const chat = chatById(chatId);
  if (!chat) {
    return;
  }
  if (state.route === 'profile' || state.route === 'setting') {
    emit('open-chat', chat.id);
    return;
  }
  if (state.activeChat && state.activeChat.id === chat.id) {
    showPane();
    composer.focus();
    router.replace('chat', 0, chat.uid ?? '');
    return;
  }
  state.activeChat = chat;
  state.messages = [];
  state.hasMore = false;
  state.typingIds = [];
  state.onlineIds = [];
  chat.unread = 0;
  readSentId = 0;
  readSentAt = 0;
  messages.clear();
  messages.showLoading();
  composer.clearQuote();
  renderHead();
  showPane();
  emit('chats');
  emit('active');
  router.replace('chat', 0, chat.uid ?? '');
  try {
    const res = await apiGet('api/messages.php', { chat_id: chat.id });
    if (!state.activeChat || state.activeChat.id !== chat.id) {
      return;
    }
    state.messages = res.messages;
    state.hasMore = res.has_more;
    messages.render(false);
    markRead();
  } catch (error) {
    toast(error.message, true);
  }
  composer.focus();
}

export function init() {
  $('#panel-body').addEventListener('click', (event) => {
    if (event.target.closest('[data-user]') !== null) {
      return;
    }
    const item = event.target.closest('[data-chat]');
    if (item !== null && state.view === 'chats') {
      open(Number(item.dataset.chat));
    }
  });

  $('#panel-search').addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    if (state.view === 'chats') {
      render();
    }
  });

  $('#chat-head').addEventListener('click', (event) => {
    if (!state.activeChat) {
      return;
    }
    const callAudio = event.target.closest('#chat-call-audio');
    if (callAudio !== null) {
      import('./call.js').then(({ start }) => start(state.activeChat.avatar_user, 'audio'));
      return;
    }
    const callVideo = event.target.closest('#chat-call-video');
    if (callVideo !== null) {
      import('./call.js').then(({ start }) => start(state.activeChat.avatar_user, 'video'));
      return;
    }
    if (event.target.closest('#chat-gcall') !== null) {
      gcall.join(state.activeChat.id).catch(() => {});
      return;
    }
    if (event.target.closest('#chat-info-btn') === null) {
      return;
    }
    if (state.activeChat.type === 'group') {
      drawer.openGroupInfo(state.activeChat.id);
    } else {
      emit('navigate', { name: 'profile', id: state.activeChat.avatar_user });
    }
  });

  $('#chat-back').addEventListener('click', closePane);

  on('chats', renderHead);
}
