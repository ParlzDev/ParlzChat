import { state, on } from './state.js';
import { $, esc, avatarHtml, toast, uidName, fmtSize, uploadUrl, downloadFile } from './util.js';
import { apiGet, apiPost } from './api.js';
import { uploadFile } from './upload.js';
import { stickerSvg, stickerToken, staticStickerNames, animatedStickerNames } from './stickers.js';
import { quotePreview } from './richtext.js';
import { icon } from './icons.js';
import * as cut from './cut.js';

let mentionList = [];
let mentionIndex = 0;
let quoteDraft = null;
let applyPlaceholder = null;
let voiceMode = false;
let voiceRecorder = null;
let voiceStream = null;
let voiceChunks = [];
let voiceStartAt = 0;
let voiceCancelled = false;
let voiceHolding = false;
let voiceStartY = 0;

function pickVoiceMime() {
  if (typeof window.MediaRecorder !== 'function') {
    return '';
  }
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const mime of options) {
    if (typeof window.MediaRecorder.isTypeSupported !== 'function' || window.MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

function stopVoiceStream() {
  if (voiceStream !== null) {
    voiceStream.getTracks().forEach((track) => track.stop());
    voiceStream = null;
  }
}

function resetVoiceButton() {
  const hold = $('#voice-hold');
  if (hold !== null) {
    hold.classList.remove('is-recording', 'is-cancel');
    hold.textContent = '按住 说话';
  }
}

function abortVoice() {
  voiceCancelled = true;
  if (voiceRecorder !== null) {
    try {
      voiceRecorder.stop();
    } catch (error) {
      voiceRecorder = null;
    }
  }
  stopVoiceStream();
  resetVoiceButton();
}

function setVoiceMode(on) {
  voiceMode = on;
  $('#composer-input').classList.toggle('is-hidden', on);
  $('#voice-hold').classList.toggle('is-hidden', !on);
  $('#voice-btn').classList.toggle('is-active', on);
  if (!on) {
    abortVoice();
  }
}

async function startVoice() {
  if (!state.activeChat) {
    toast('先选择一个会话', true);
    return;
  }
  if (typeof window.MediaRecorder !== 'function' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    toast('当前浏览器不支持录音', true);
    return;
  }
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    toast('无法使用麦克风，请检查浏览器权限', true);
    return;
  }
  if (!voiceHolding) {
    stopVoiceStream();
    return;
  }
  const mime = pickVoiceMime();
  voiceChunks = [];
  voiceCancelled = false;
  voiceStartAt = Date.now();
  try {
    voiceRecorder = mime === '' ? new window.MediaRecorder(voiceStream) : new window.MediaRecorder(voiceStream, { mimeType: mime });
  } catch (error) {
    stopVoiceStream();
    toast('当前浏览器不支持录音', true);
    return;
  }
  voiceRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      voiceChunks.push(event.data);
    }
  };
  voiceRecorder.onstop = async () => {
    const seconds = (Date.now() - voiceStartAt) / 1000;
    const type = voiceRecorder !== null && voiceRecorder.mimeType ? voiceRecorder.mimeType : 'audio/webm';
    voiceRecorder = null;
    stopVoiceStream();
    if (voiceCancelled) {
      return;
    }
    if (seconds < 0.6) {
      toast('说话时间太短', true);
      return;
    }
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const blob = new Blob(voiceChunks, { type });
    if (blob.size <= 0) {
      toast('录音失败，请重试', true);
      return;
    }
    try {
      const form = new FormData();
      form.append('file', new File([blob], 'voice.' + ext, { type }));
      const up = await uploadFile('api/uploads.php', form, '语音消息');
      await send(JSON.stringify({ file: up.file, name: '语音消息', size: up.size, dur: Math.max(1, Math.round(seconds)) }), 'voice');
    } catch (error) {
      toast(error.message, true);
    }
  };
  voiceRecorder.start();
  const hold = $('#voice-hold');
  hold.classList.add('is-recording');
  hold.textContent = '松开发送 · 上滑取消';
}

function endVoiceHold(event) {
  if (!voiceHolding && voiceRecorder === null) {
    return;
  }
  voiceHolding = false;
  if (voiceRecorder === null) {
    return;
  }
  const cancelled = voiceStartY - event.clientY > 60;
  resetVoiceButton();
  if (cancelled) {
    abortVoice();
    return;
  }
  voiceCancelled = false;
  try {
    voiceRecorder.stop();
  } catch (error) {
    voiceRecorder = null;
    stopVoiceStream();
  }
}

const ENTER_KEY = 'parlz-enter-send';

export function enterSends() {
  try {
    return window.localStorage.getItem(ENTER_KEY) !== '0';
  } catch (error) {
    return true;
  }
}

export function setEnterSends(on) {
  try {
    window.localStorage.setItem(ENTER_KEY, on ? '1' : '0');
  } catch (error) {
    return;
  }
  refreshPlaceholder();
}

export function refreshPlaceholder() {
  if (applyPlaceholder !== null) {
    applyPlaceholder();
  }
}

function inputNode() {
  return $('#composer-input');
}

function stickerPanel() {
  return $('#sticker-panel');
}

function mentionPanel() {
  return $('#mention-panel');
}

function morePanel() {
  return $('#composer-more');
}

function nativeCapture() {
  const bridge = window.ParlzDesktop;
  return bridge !== null && typeof bridge === 'object' && typeof bridge.captureScreen === 'function';
}

function moreItems() {
  return [
    { act: 'image', icon: 'image', label: '上传文件' },
  ];
}

function renderMorePanel() {
  const panel = morePanel();
  if (panel === null) {
    return;
  }
  panel.innerHTML = moreItems().map((item) =>
    '<button type="button" class="composer-more-item' + (item.on ? ' is-on' : '') + '" data-more="' + item.act + '">' +
    icon(item.icon) + '<span>' + esc(item.label) + '</span></button>').join('');
}

function toggleMore(force) {
  const panel = morePanel();
  if (panel === null) {
    return;
  }
  const show = force === undefined ? panel.classList.contains('is-hidden') : force;
  if (show) {
    if (!state.activeChat) {
      toast('先选择一个会话', true);
      return;
    }
    renderMorePanel();
    hideMentions();
    togglePanel(false);
  }
  panel.classList.toggle('is-hidden', !show);
  const btn = $('#more-btn');
  if (btn !== null) {
    btn.classList.toggle('is-active', show);
  }
}

async function runMore(act) {
  toggleMore(false);
  if (act === 'image') {
    $('#image-input').click();
  }
}

function resize() {
  const input = inputNode();
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

export function startQuote(message) {
  if (!message || message.kind === 'recalled') {
    toast('这条消息不能引用', true);
    return;
  }
  quoteDraft = {
    id: message.id,
    name: message.author && message.author.nickname ? message.author.nickname : '成员',
    uid: message.author && message.author.uid ? message.author.uid : '',
    kind: message.kind,
    body: message.body,
  };
  renderQuoteBar();
  focus();
}

export function clearQuote() {
  quoteDraft = null;
  renderQuoteBar();
}

function renderQuoteBar() {
  const bar = $('#quote-bar');
  if (bar === null) {
    return;
  }
  if (quoteDraft === null) {
    bar.classList.add('is-hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('is-hidden');
  bar.innerHTML = '<span class="quote-bar-label">引用 ' + esc(quoteDraft.name) + '</span>' +
    '<span class="quote-bar-text">' + esc(quotePreview(quoteDraft)) + '</span>' +
    '<button type="button" class="quote-bar-close" id="quote-clear" title="取消引用">✕</button>';
  $('#quote-clear').addEventListener('click', clearQuote);
}

function syncTyping() {
  state.composerTyping = inputNode().value.trim() !== '';
}

function insertAtCursor(text) {
  const input = inputNode();
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.selectionStart = start + text.length;
  input.selectionEnd = start + text.length;
  input.focus();
  resize();
  syncTyping();
}

export function togglePanel(force) {
  const panel = stickerPanel();
  const show = force === undefined ? panel.classList.contains('is-hidden') : force;
  panel.classList.toggle('is-hidden', !show);
  if (show) {
    hideMentions();
  }
}

function membersOf(chat) {
  if (!chat || chat.type !== 'group') {
    return null;
  }
  return state.chatMembers[chat.id] ?? null;
}

async function ensureMembers(chat) {
  if (!chat || chat.type !== 'group') {
    return null;
  }
  if (state.chatMembers[chat.id] !== undefined) {
    return state.chatMembers[chat.id];
  }
  try {
    const res = await apiGet('api/groups.php', { action: 'info', chat_id: chat.id });
    state.chatMembers[chat.id] = res.group.members;
  } catch {
    state.chatMembers[chat.id] = [];
  }
  return state.chatMembers[chat.id];
}

function hideMentions() {
  mentionPanel().classList.add('is-hidden');
  mentionList = [];
  mentionIndex = 0;
}

function mentionQuery() {
  const input = inputNode();
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const match = /@([^\s@]{0,24})$/.exec(before);
  return match === null ? null : match[1];
}

function renderMentions() {
  const panel = mentionPanel();
  if (mentionList.length === 0) {
    panel.innerHTML = '<p class="mention-empty">没有匹配的成员</p>';
    return;
  }
  panel.innerHTML = mentionList.map((member, index) => {
    const me = state.user ? state.user.id : 0;
    const head = '<button type="button" class="mention-item' + (index === mentionIndex ? ' is-active' : '') + '" data-mention="' + index + '">' +
      avatarHtml(member, 'avatar-sm', member.online);
    if (member.all) {
      return head + '<span class="row-main"><span class="row-name">所有人</span>' +
        '<span class="row-sub">提醒所有群成员</span></span></button>';
    }
    return head +
      '<span class="row-main"><span class="row-name">' + esc(member.nickname) +
      (member.id === me ? '<span class="pending-tag">我</span>' : '') + '</span>' +
      '<span class="row-sub mono">@' + esc(member.username) + ' · ' + esc(member.uid ?? '') + '</span></span>' +
      '</button>';
  }).join('');
}

function updateMentions() {
  const chat = state.activeChat;
  if (!chat || chat.type !== 'group') {
    hideMentions();
    return;
  }
  const query = mentionQuery();
  if (query === null) {
    hideMentions();
    return;
  }
  const members = membersOf(chat);
  if (members === null) {
    ensureMembers(chat).then(() => {
      if (mentionQuery() !== null) {
        updateMentions();
      }
    });
    return;
  }
  const needle = query.toLowerCase();
  const everyone = { all: true, id: 0, nickname: '所有人', username: '所有人', uid: '', avatar: '', online: false };
  mentionList = [everyone].concat(members)
    .filter((member) => needle === ''
      || member.nickname.toLowerCase().includes(needle)
      || member.username.toLowerCase().includes(needle)
      || uidName(member.uid).toLowerCase().includes(needle))
    .slice(0, 7);
  mentionIndex = 0;
  mentionPanel().classList.remove('is-hidden');
  renderMentions();
}

function pickMention(index) {
  const member = mentionList[index];
  if (!member) {
    return;
  }
  const input = inputNode();
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const match = /@([^\s@]{0,24})$/.exec(before);
  const start = match === null ? caret : caret - match[0].length;
  const text = '@' + member.nickname + ' ';
  input.value = input.value.slice(0, start) + text + input.value.slice(caret);
  input.selectionStart = start + text.length;
  input.selectionEnd = start + text.length;
  hideMentions();
  input.focus();
  resize();
  syncTyping();
}

async function send(body, kind) {
  const chat = state.activeChat;
  if (!chat) {
    return;
  }
  const max = window.PARLZ_BOOT && window.PARLZ_BOOT.messageMax ? window.PARLZ_BOOT.messageMax : 2000;
  if (kind === 'text' && (body === '' || body.length > max)) {
    if (body.length > max) {
      toast('消息不能超过 ' + max + ' 个字符', true);
    }
    return;
  }
  let sendKind = kind;
  let sendBody = body;
  if (kind === 'text' && quoteDraft !== null) {
    sendKind = 'quote';
    sendBody = JSON.stringify({ text: body, quote: quoteDraft });
  }
  const button = $('#send-btn');
  button.disabled = true;
  try {
    const res = await apiPost('api/messages.php', { chat_id: chat.id, body: sendBody, kind: sendKind });
    if (kind === 'text') {
      inputNode().value = '';
      writeDraft(chat.id, '');
      resize();
      syncTyping();
      clearQuote();
    }
    const { merge } = await import('./messages.js');
    merge([res.message]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    inputNode().focus();
  }
}

let draftChatId = 0;
let draftTimer = 0;

function draftKey(chatId) {
  return 'parlz.draft.' + String((state.user ?? {}).id ?? 0) + '.' + chatId;
}

function readDraft(chatId) {
  try {
    return localStorage.getItem(draftKey(chatId)) ?? '';
  } catch (error) {
    return '';
  }
}

function writeDraft(chatId, text) {
  try {
    if (text.trim() === '') {
      localStorage.removeItem(draftKey(chatId));
      return;
    }
    localStorage.setItem(draftKey(chatId), text);
  } catch (error) {
    return;
  }
}

function saveDraftNow() {
  const chat = state.activeChat;
  const input = inputNode();
  if (chat === null || input === null) {
    return;
  }
  writeDraft(chat.id, input.value);
}

function applyDraft(chatId) {
  const input = inputNode();
  if (input === null || draftChatId === chatId) {
    return;
  }
  const previous = draftChatId;
  draftChatId = chatId;
  if (previous !== 0) {
    writeDraft(previous, input.value);
  }
  input.value = readDraft(chatId);
  resize();
  syncTyping();
}

export function focus() {
  inputNode().focus();
}

export function insertMention(name) {
  if (!state.activeChat || state.activeChat.type !== 'group') {
    toast('只有群聊可以 @ 成员', true);
    return;
  }
  insertAtCursor('@' + String(name) + ' ');
}

function confirmSend(title, bodyHtml) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'modal img-confirm';
    layer.innerHTML = '<div class="modal-card img-confirm-card">' +
      '<header class="modal-head"><h2 class="modal-title">' + esc(title) + '</h2></header>' +
      '<div class="modal-body img-confirm-body">' + bodyHtml + '</div>' +
      '<div class="form-actions img-confirm-actions">' +
        '<button type="button" class="btn" data-confirm="no">取消</button>' +
        '<button type="button" class="btn btn-primary" data-confirm="yes">发送</button>' +
      '</div>' +
      '</div>';
    let settled = false;
    const done = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener('keydown', onKey);
      layer.remove();
      resolve(ok);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        done(false);
      }
    };
    layer.querySelector('[data-confirm="yes"]').addEventListener('click', () => done(true));
    layer.querySelector('[data-confirm="no"]').addEventListener('click', () => done(false));
    layer.addEventListener('click', (event) => {
      if (event.target === layer) {
        done(false);
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(layer);
  });
}

function confirmImage(file) {
  const url = URL.createObjectURL(file);
  const promise = confirmSend('发送这张图片？', '<img src="' + url + '" alt="图片预览">');
  promise.finally(() => URL.revokeObjectURL(url));
  return promise;
}

function confirmFile(file) {
  return confirmSend('发送这个文件？',
    '<div class="file-confirm-info">' + icon('file') +
      '<div class="file-body"><div class="file-name">' + esc(file.name) + '</div>' +
      '<div class="file-size">' + fmtSize(file.size) + '</div></div></div>');
}

async function sendAttachment(file) {
  if (!state.activeChat) {
    toast('先选择一个会话', true);
    return;
  }
  if (String(file.type).startsWith('image/')) {
    await sendImageFile(file);
    return;
  }
  const max = window.PARLZ_BOOT && window.PARLZ_BOOT.fileMax ? window.PARLZ_BOOT.fileMax : 20971520;
  if (file.size <= 0) {
    toast('不能发送空文件', true);
    return;
  }
  if (file.size > max) {
    toast('文件不能超过 ' + Math.round(max / 1048576) + 'MB', true);
    return;
  }
  const confirmed = await confirmFile(file);
  if (!confirmed) {
    return;
  }
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await uploadFile('api/uploads.php', form, file.name);
    await send(JSON.stringify({ file: res.file, name: res.name, size: res.size }), 'file');
  } catch (error) {
    toast(error.message, true);
  }
}

async function loadMyStickers() {
  const host = $('#my-stickers');
  if (host === null) {
    return;
  }
  try {
    const res = await apiGet('api/stickers.php');
    const items = res.stickers ?? [];
    host.innerHTML = items.map((sticker) =>
      '<button type="button" class="my-sticker" data-mysticker="' + esc(sticker.file) + '" title="点击直接发送"><img src="' + esc(uploadUrl(sticker.file)) + '" alt="表情" loading="lazy"></button>').join('') +
      '<button type="button" class="my-sticker my-sticker-add" id="my-sticker-add" title="上传表情（GIF 会动）">' + icon('plus') + '</button>';
  } catch (error) {
    host.innerHTML = '';
  }
}

function uploadMySticker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await uploadFile('api/uploads.php', form, file.name);
      await apiPost('api/stickers.php', { action: 'add', file: res.file });
      toast('已收藏这个表情');
      await loadMyStickers();
    } catch (error) {
      toast(error.message, true);
    }
  });
  input.click();
}

async function sendMySticker(file) {
  if (!state.activeChat) {
    toast('先选择一个会话', true);
    return;
  }
  await send(file, 'csticker');
}

async function sendImageFile(file) {
  if (!state.activeChat) {
    toast('先选择一个会话', true);
    return;
  }
  if (!file || !String(file.type).startsWith('image/')) {
    toast('只能发送图片文件', true);
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('图片不能超过 8MB', true);
    return;
  }
  const confirmed = await confirmImage(file);
  if (!confirmed) {
    return;
  }
  try {
    const form = new FormData();
    form.append('image', file);
    const res = await uploadFile('api/uploads.php', form, file.name);
    await send(res.file, 'image');
  } catch (error) {
    toast(error.message, true);
  }
}

async function takeScreenshot() {
  if (!nativeCapture()) {
    return;
  }
  const data = await cut.capture();
  if (data === '') {
    return;
  }
  await cut.show(data, { onSend: sendImageFile, canSend: true });
}

export function init() {
  const input = inputNode();

  const updatePlaceholder = () => {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const hint = enterSends() ? 'Enter 发送 / Shift+Enter 换行' : 'Enter 换行 / Ctrl+Enter 发送';
    input.placeholder = mobile ? '输入消息' : '输入消息，' + hint + ' / @ 提到成员 / 可直接粘贴图片';
  };
  applyPlaceholder = updatePlaceholder;
  updatePlaceholder();
  window.addEventListener('resize', updatePlaceholder);

  stickerPanel().innerHTML =
    '<div class="sticker-head">我的表情</div>' +
    '<div class="my-stickers" id="my-stickers"></div>' +
    '<div class="sticker-head">默认表情</div>' +
    staticStickerNames()
      .map((name) => '<button type="button" class="sticker-item" data-sticker="' + name + '" title="插入表情">' + stickerSvg(name) + '</button>')
      .join('') +
    '<div class="sticker-head">动态表情</div>' +
    animatedStickerNames()
      .map((name) => '<button type="button" class="sticker-item" data-sticker="' + name + '" title="插入表情">' + stickerSvg(name) + '</button>')
      .join('');
  loadMyStickers();

  stickerPanel().addEventListener('click', (event) => {
    const addBtn = event.target.closest('#my-sticker-add');
    if (addBtn !== null) {
      uploadMySticker();
      return;
    }
    const mine = event.target.closest('[data-mysticker]');
    if (mine !== null) {
      sendMySticker(mine.dataset.mysticker);
      togglePanel(false);
      return;
    }
    const item = event.target.closest('[data-sticker]');
    if (item === null) {
      return;
    }
    insertAtCursor(stickerToken(item.dataset.sticker));
  });

  mentionPanel().addEventListener('click', (event) => {
    const item = event.target.closest('[data-mention]');
    if (item === null) {
      return;
    }
    pickMention(Number(item.dataset.mention));
  });

  input.addEventListener('input', () => {
    resize();
    syncTyping();
    updateMentions();
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveDraftNow, 400);
  });

  input.addEventListener('click', () => hideMentions());
  input.addEventListener('blur', () => window.setTimeout(hideMentions, 150));

  on('open-chat', (chatId) => {
    let tries = 0;
    const tick = () => {
      tries++;
      const chat = state.activeChat;
      if (chat !== null && chat.id === Number(chatId)) {
        applyDraft(chat.id);
        return;
      }
      if (tries < 12) {
        window.setTimeout(tick, 60);
      }
    };
    window.setTimeout(tick, 60);
  });
  if (state.activeChat !== null) {
    applyDraft(state.activeChat.id);
  }

  input.addEventListener('paste', (event) => {
    const items = event.clipboardData ? Array.from(event.clipboardData.items) : [];
    for (const item of items) {
      if (item.kind === 'file' && String(item.type).startsWith('image/')) {
        const file = item.getAsFile();
        if (file !== null) {
          event.preventDefault();
          sendImageFile(file);
        }
        return;
      }
    }
  });

  input.addEventListener('keydown', (event) => {
    if (!mentionPanel().classList.contains('is-hidden') && mentionList.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionList.length;
        renderMentions();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionIndex = (mentionIndex + mentionList.length - 1) % mentionList.length;
        renderMentions();
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pickMention(mentionIndex);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hideMentions();
        return;
      }
    }
    if (event.key === 'Enter' && !event.isComposing) {
      const withCtrl = event.ctrlKey || event.metaKey;
      const trigger = enterSends() ? !event.shiftKey : withCtrl;
      if (trigger) {
        event.preventDefault();
        send(input.value.trim(), 'text');
      }
    }
  });

  $('#send-btn').addEventListener('click', () => {
    hideMentions();
    send(input.value.trim(), 'text');
  });

  $('#voice-btn').addEventListener('click', () => {
    toggleMore(false);
    togglePanel(false);
    setVoiceMode(!voiceMode);
    if (!voiceMode) {
      focus();
    }
  });

  $('#emoji-btn').addEventListener('click', () => {
    toggleMore(false);
    togglePanel();
  });

  const shotBtn = $('#shot-btn');
  if (nativeCapture()) {
    shotBtn.addEventListener('click', () => {
      toggleMore(false);
      togglePanel(false);
      takeScreenshot();
    });
  } else {
    shotBtn.classList.add('is-hidden');
  }

  const imageInput = $('#image-input');
  imageInput.addEventListener('change', () => {
    const file = imageInput.files && imageInput.files[0];
    if (file) {
      sendAttachment(file);
    }
    imageInput.value = '';
  });

  const holdBtn = $('#voice-hold');
  holdBtn.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    voiceHolding = true;
    voiceStartY = event.clientY;
    try {
      holdBtn.setPointerCapture(event.pointerId);
    } catch (error) {
      voiceHolding = true;
    }
    startVoice();
  });
  holdBtn.addEventListener('pointermove', (event) => {
    if (voiceRecorder === null && !voiceHolding) {
      return;
    }
    const cancelled = voiceStartY - event.clientY > 60;
    holdBtn.classList.toggle('is-cancel', cancelled);
    holdBtn.textContent = cancelled ? '松开取消' : '松开发送 · 上滑取消';
  });
  holdBtn.addEventListener('pointerup', (event) => endVoiceHold(event));
  holdBtn.addEventListener('pointercancel', (event) => endVoiceHold(event));

  document.addEventListener('click', (event) => {
    if (event.target.closest('#more-btn') !== null) {
      toggleMore();
      return;
    }
    const picked = event.target.closest('[data-more]');
    if (picked !== null) {
      runMore(picked.dataset.more);
      return;
    }
    if (event.target.closest('#sticker-panel') === null && event.target.closest('#emoji-btn') === null) {
      togglePanel(false);
    }
    if (event.target.closest('#composer-more') === null) {
      toggleMore(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleMore(false);
      togglePanel(false);
    }
  });
}
