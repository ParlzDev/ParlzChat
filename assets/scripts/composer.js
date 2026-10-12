import { state } from './state.js';
import { $, esc, avatarHtml, toast, uidName, fmtSize, uploadUrl, downloadFile } from './util.js';
import { apiGet, apiPost } from './api.js';
import { uploadFile } from './upload.js';
import { stickerNames, stickerSvg, stickerToken } from './stickers.js';
import { quotePreview } from './richtext.js';
import { icon } from './icons.js';

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
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
    toast('当前环境不支持截屏，请用 HTTPS 或 localhost 打开本站', true);
    return;
  }
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch {
    return;
  }
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 240));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.95));
    if (blob === null) {
      toast('截屏失败', true);
      return;
    }
    openShotDialog(URL.createObjectURL(blob));
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

const SHOT_TOOLS = ['rect', 'ellipse', 'arrow', 'pen', 'text', 'mosaic'];
const SHOT_COLORS = ['#ff3b30', '#00d95f', '#2f7bff', '#ffd400', '#0b2415'];

let shotImage = null;
let shotUrl = '';
let shotRect = null;
let shotDrag = null;
let shotView = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
let shotTool = 'rect';
let shotColor = SHOT_COLORS[0];
let shotShapes = [];
let shotDraft = null;
let shotTextNode = null;

function shotCanvas() {
  return $('#shot-canvas');
}

function shotClip() {
  return shotRect ?? shotFullRect();
}

function shotImagePoint(event) {
  const scale = shotView.scale || 1;
  return {
    x: (event.clientX - shotView.x) / scale,
    y: (event.clientY - shotView.y) / scale,
  };
}

function shotMapDisplay(point) {
  const scale = shotView.scale || 1;
  return { x: shotView.x + point.x * scale, y: shotView.y + point.y * scale };
}

function shotMapExport(sourceX, sourceY) {
  return (point) => ({ x: point.x - sourceX, y: point.y - sourceY });
}

function shotMosaic(ctx, shape, map, scale, ratio) {
  const a = map(shape.a);
  const b = map(shape.b);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w < 4 || h < 4) {
    return;
  }
  const block = Math.max(6, Math.round(10 * scale));
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(w / block));
  tmp.height = Math.max(1, Math.round(h / block));
  tmp.getContext('2d').drawImage(ctx.canvas, x * ratio, y * ratio, w * ratio, h * ratio, 0, 0, tmp.width, tmp.height);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
  ctx.imageSmoothingEnabled = smooth;
}

function shotStroke(ctx, shape, map, scale) {
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = Math.max(1.5, 3 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const a = map(shape.a);
  const b = map(shape.b);
  if (shape.tool === 'rect') {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return;
  }
  if (shape.tool === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (shape.tool === 'arrow') {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(9, 15 * scale);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape.tool === 'pen') {
    ctx.beginPath();
    shape.points.forEach((point, index) => {
      const mapped = map(point);
      if (index === 0) {
        ctx.moveTo(mapped.x, mapped.y);
      } else {
        ctx.lineTo(mapped.x, mapped.y);
      }
    });
    ctx.stroke();
    return;
  }
  if (shape.tool === 'text') {
    ctx.font = 'bold ' + Math.max(11, Math.round(21 * scale)) + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(shape.text, a.x, a.y);
  }
}

function shotPaint(ctx, map, scale, ratio, shapes) {
  shapes.forEach((shape) => {
    if (shape.tool === 'mosaic') {
      shotMosaic(ctx, shape, map, scale, ratio);
      return;
    }
    shotStroke(ctx, shape, map, scale);
  });
}

function shotLayout() {
  const canvas = shotCanvas();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const scale = shotImage === null
    ? 1
    : Math.min(width / shotImage.naturalWidth, height / shotImage.naturalHeight);
  const drawW = shotImage === null ? 0 : Math.round(shotImage.naturalWidth * scale);
  const drawH = shotImage === null ? 0 : Math.round(shotImage.naturalHeight * scale);
  shotView = {
    scale,
    x: Math.round((width - drawW) / 2),
    y: Math.round((height - drawH) / 2),
    w: drawW,
    h: drawH,
  };
}

function shotFullRect() {
  return { x: shotView.x, y: shotView.y, w: shotView.w, h: shotView.h };
}

function shotPositionBar(rect) {
  const bar = $('#shot-bar');
  if (bar === null) {
    return;
  }
  const barW = bar.offsetWidth || 560;
  const barH = bar.offsetHeight || 40;
  let left = rect.x + rect.w - barW;
  if (left + barW > window.innerWidth - 12) {
    left = window.innerWidth - barW - 12;
  }
  if (left < 12) {
    left = 12;
  }
  let top = rect.y + rect.h + 10;
  if (top + barH > window.innerHeight - 12) {
    top = Math.max(12, rect.y - barH - 10);
  }
  bar.style.left = Math.round(left) + 'px';
  bar.style.top = Math.round(top) + 'px';
}

function drawShot() {
  const canvas = shotCanvas();
  const ratio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  if (shotImage === null) {
    return;
  }
  const rect = shotClip();
  if (rect.w < 1 || rect.h < 1) {
    ctx.drawImage(shotImage, shotView.x, shotView.y, shotView.w, shotView.h);
    shotPositionBar(shotFullRect());
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(shotImage, shotView.x, shotView.y, shotView.w, shotView.h);
  shotPaint(ctx, shotMapDisplay, shotView.scale || 1, ratio, shotDraft === null ? shotShapes : shotShapes.concat([shotDraft]));
  ctx.restore();
  ctx.strokeStyle = '#00ff6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.w - 2), Math.max(0, rect.h - 2));
  shotPositionBar(rect);
  updateShotSize();
}

function updateShotSize() {
  const node = $('#shot-size');
  if (node === null || shotImage === null) {
    return;
  }
  const rect = shotClip();
  const scale = shotView.scale || 1;
  node.textContent = Math.round(rect.w / scale) + ' × ' + Math.round(rect.h / scale);
}

function shotPoint(event) {
  return {
    x: Math.max(shotView.x, Math.min(shotView.x + shotView.w, event.clientX)),
    y: Math.max(shotView.y, Math.min(shotView.y + shotView.h, event.clientY)),
  };
}

function onShotResize() {
  if (shotImage === null) {
    return;
  }
  shotLayout();
  shotRect = shotFullRect();
  drawShot();
  updateShotSize();
}

function shotTextCommit() {
  if (shotTextNode === null) {
    return;
  }
  const active = shotTextNode;
  shotTextNode = null;
  const text = active.node.value.trim();
  active.node.remove();
  if (text === '') {
    return;
  }
  shotShapes.push({ tool: 'text', color: shotColor, a: active.point, b: active.point, text: text });
  drawShot();
}

function shotTextStart(event) {
  shotTextCommit();
  const point = shotImagePoint(event);
  const node = document.createElement('input');
  node.type = 'text';
  node.className = 'shot-text';
  node.maxLength = 80;
  node.style.left = Math.round(Math.min(event.clientX, window.innerWidth - 170)) + 'px';
  node.style.top = Math.round(Math.min(event.clientY - 14, window.innerHeight - 48)) + 'px';
  document.body.appendChild(node);
  shotTextNode = { node: node, point: point };
  node.focus();
  node.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      shotTextCommit();
      return;
    }
    if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      const dropped = shotTextNode;
      shotTextNode = null;
      if (dropped !== null) {
        dropped.node.remove();
      }
      drawShot();
    }
  });
  node.addEventListener('blur', shotTextCommit);
}

function shotExportCanvas() {
  const rect = shotClip();
  const scale = shotView.scale || 1;
  const sourceX = Math.max(0, Math.round((rect.x - shotView.x) / scale));
  const sourceY = Math.max(0, Math.round((rect.y - shotView.y) / scale));
  const sourceW = Math.max(1, Math.min(shotImage.naturalWidth - sourceX, Math.round(rect.w / scale)));
  const sourceH = Math.max(1, Math.min(shotImage.naturalHeight - sourceY, Math.round(rect.h / scale)));
  const canvas = document.createElement('canvas');
  canvas.width = sourceW;
  canvas.height = sourceH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(shotImage, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sourceW, sourceH);
  ctx.clip();
  shotPaint(ctx, shotMapExport(sourceX, sourceY), 1, 1, shotShapes);
  ctx.restore();
  return canvas;
}

function shotBlob(type, quality) {
  return new Promise((resolve) => shotExportCanvas().toBlob(resolve, type, quality));
}

function shotSyncTools() {
  document.querySelectorAll('[data-shot-tool]').forEach((node) => {
    node.classList.toggle('is-active', node.dataset.shotTool === shotTool);
  });
  document.querySelectorAll('[data-shot-color]').forEach((node) => {
    node.classList.toggle('is-active', node.dataset.shotColor === shotColor);
  });
}

export function openShotDialog(imageUrl) {
  const image = new Image();
  image.onload = () => {
    shotImage = image;
    shotUrl = imageUrl;
    shotShapes = [];
    shotDraft = null;
    shotTool = 'rect';
    shotColor = SHOT_COLORS[0];
    shotLayout();
    shotRect = shotFullRect();
    shotSyncTools();
    drawShot();
    $('#shot-modal').classList.remove('is-hidden');
    window.addEventListener('resize', onShotResize);
  };
  image.src = imageUrl;
}

export function closeShotDialog() {
  shotTextCommit();
  const modal = $('#shot-modal');
  if (modal !== null) {
    modal.classList.add('is-hidden');
  }
  if (shotUrl !== '') {
    URL.revokeObjectURL(shotUrl);
    shotUrl = '';
  }
  window.removeEventListener('resize', onShotResize);
  shotImage = null;
  shotRect = null;
  shotDrag = null;
  shotDraft = null;
  shotShapes = [];
}

async function confirmShot() {
  if (shotImage === null) {
    closeShotDialog();
    return;
  }
  const blob = await shotBlob('image/webp', 0.92);
  closeShotDialog();
  if (blob === null) {
    toast('截屏失败', true);
    return;
  }
  await sendImageFile(new File([blob], 'screenshot.webp', { type: 'image/webp' }));
}

async function saveShot() {
  if (shotImage === null) {
    return;
  }
  const blob = await shotBlob('image/png');
  if (blob === null) {
    toast('截屏失败', true);
    return;
  }
  const name = 'parlz-shot-' + Date.now() + '.png';
  const url = URL.createObjectURL(blob);
  closeShotDialog();
  await downloadFile(url, name);
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

async function copyShot() {
  if (shotImage === null) {
    return;
  }
  if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
    toast('当前环境不支持复制图片，请用「保存」', true);
    return;
  }
  const blob = await shotBlob('image/png');
  if (blob === null) {
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    closeShotDialog();
    toast('已复制到剪贴板');
  } catch {
    toast('复制失败，请用「保存」', true);
  }
}

function wireShotDialog() {
  const canvas = shotCanvas();

  canvas.addEventListener('pointerdown', (event) => {
    if (shotImage === null) {
      return;
    }
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      shotDrag = null;
    }
    if (shotTool === 'text') {
      shotTextStart(event);
      return;
    }
    const point = shotPoint(event);
    const rect = shotClip();
    if (shotRect === null || rect.w >= shotView.w - 2) {
      shotDrag = { mode: 'select', x: point.x, y: point.y };
      shotRect = { x: point.x, y: point.y, w: 0, h: 0 };
      drawShot();
      return;
    }
    const imagePoint = shotImagePoint(event);
    shotDrag = { mode: 'draw', x: point.x, y: point.y };
    shotDraft = shotTool === 'pen'
      ? { tool: 'pen', color: shotColor, points: [imagePoint], a: imagePoint, b: imagePoint }
      : { tool: shotTool, color: shotColor, a: imagePoint, b: imagePoint };
    drawShot();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (shotDrag === null) {
      return;
    }
    if (shotDrag.mode === 'select') {
      const point = shotPoint(event);
      shotRect = {
        x: Math.min(shotDrag.x, point.x),
        y: Math.min(shotDrag.y, point.y),
        w: Math.abs(point.x - shotDrag.x),
        h: Math.abs(point.y - shotDrag.y),
      };
      drawShot();
      return;
    }
    if (shotDraft === null) {
      return;
    }
    const imagePoint = shotImagePoint(event);
    shotDraft.b = imagePoint;
    if (shotDraft.tool === 'pen') {
      shotDraft.points.push(imagePoint);
    }
    drawShot();
  });

  canvas.addEventListener('pointerup', () => {
    if (shotDrag === null) {
      return;
    }
    const mode = shotDrag.mode;
    shotDrag = null;
    if (mode === 'select') {
      if (shotRect === null || shotRect.w < 8 || shotRect.h < 8) {
        shotRect = shotFullRect();
      }
      drawShot();
      return;
    }
    if (shotDraft === null) {
      return;
    }
    const draft = shotDraft;
    shotDraft = null;
    const scale = shotView.scale || 1;
    const wide = Math.abs(draft.b.x - draft.a.x) * scale;
    const tall = Math.abs(draft.b.y - draft.a.y) * scale;
    if (draft.tool === 'pen' ? draft.points.length > 1 : (wide > 3 || tall > 3)) {
      shotShapes.push(draft);
    }
    drawShot();
  });

  document.querySelectorAll('[data-shot-tool]').forEach((node) => {
    node.addEventListener('click', () => {
      shotTextCommit();
      shotTool = String(node.dataset.shotTool ?? 'rect');
      shotSyncTools();
    });
  });

  document.querySelectorAll('[data-shot-color]').forEach((node) => {
    node.addEventListener('click', () => {
      shotColor = String(node.dataset.shotColor ?? SHOT_COLORS[0]);
      shotSyncTools();
    });
  });

  const undo = $('#shot-undo');
  if (undo !== null) {
    undo.addEventListener('click', () => {
      shotTextCommit();
      shotShapes.pop();
      drawShot();
    });
  }

  const save = $('#shot-save');
  if (save !== null) {
    save.addEventListener('click', () => {
      saveShot().catch(() => closeShotDialog());
    });
  }

  const copy = $('#shot-copy');
  if (copy !== null) {
    copy.addEventListener('click', () => {
      copyShot().catch(() => closeShotDialog());
    });
  }

  $('#shot-cancel').addEventListener('click', () => closeShotDialog());
  $('#shot-confirm').addEventListener('click', () => {
    confirmShot().catch(() => closeShotDialog());
  });

  document.addEventListener('keydown', (event) => {
    const modal = $('#shot-modal');
    if (modal === null || modal.classList.contains('is-hidden')) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeShotDialog();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      confirmShot().catch(() => closeShotDialog());
    } else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      shotShapes.pop();
      drawShot();
    }
  });
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
    stickerNames()
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
  });

  input.addEventListener('click', () => hideMentions());
  input.addEventListener('blur', () => window.setTimeout(hideMentions, 150));

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

  $('#emoji-btn').addEventListener('click', () => togglePanel());

  const imageInput = $('#image-input');
  $('#image-btn').addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', () => {
    const file = imageInput.files && imageInput.files[0];
    if (file) {
      sendAttachment(file);
    }
    imageInput.value = '';
  });

  const shotBtn = $('#shot-btn');
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
    shotBtn.classList.add('is-hidden');
  }
  shotBtn.addEventListener('click', () => takeScreenshot());
  wireShotDialog();

  $('#voice-btn').addEventListener('click', () => {
    setVoiceMode(!voiceMode);
    if (!voiceMode) {
      focus();
    }
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

  $('#mention-btn').addEventListener('click', async () => {
    togglePanel(false);
    insertAtCursor('@');
    await ensureMembers(state.activeChat);
    updateMentions();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#sticker-panel') === null && event.target.closest('#emoji-btn') === null) {
      togglePanel(false);
    }
  });
}
