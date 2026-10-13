import { state, emit, on } from './state.js';
import { $, esc, avatarHtml, toast } from './util.js';
import { apiPost } from './api.js';
import { icon } from './icons.js';
import { levelChips } from './level.js';
import { iceServers, refreshIce } from './call.js';

const MAX = 8;
const NEAR = 700;
const FAR = 1900;
const AUDIO_BITRATE = 40000;
const SPEAK_LEVEL = 14;

let chatId = 0;
let me = null;
let order = [];
let members = new Map();
let peers = new Map();
let localStream = null;
let localAnalyser = null;
let localBuffer = null;
let localSpeaking = false;
let lastSignal = 0;
let pollTimer = null;
let tickTimer = null;
let levelTimer = null;
let startedAt = 0;
let since = 0;
let muted = false;
let collapsed = false;
let busy = false;
let audioCtx = null;
let warnedPlay = false;

function panel() {
  return $('#gcall-panel');
}

function isActive() {
  return chatId > 0;
}

export function activeChatId() {
  return chatId;
}

export function inThisChat(id) {
  return isActive() && chatId === Number(id);
}

function callLayerOpen() {
  const layer = $('#call-layer');
  return layer !== null && !layer.classList.contains('is-hidden');
}

function myId() {
  return me === null ? 0 : Number(me.id);
}

function nameOf(uid) {
  const user = members.get(uid);
  return user === undefined ? '对方' : String(user.nickname ?? '对方');
}

function ensureCtx() {
  if (audioCtx !== null) {
    return audioCtx;
  }
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (typeof Ctor !== 'function') {
    return null;
  }
  try {
    audioCtx = new Ctor();
  } catch (error) {
    audioCtx = null;
  }
  return audioCtx;
}

function makeAnalyser(stream) {
  const ctx = ensureCtx();
  if (ctx === null) {
    return null;
  }
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    return { analyser, buffer: new Uint8Array(analyser.frequencyBinCount) };
  } catch (error) {
    return null;
  }
}

function peakOf(node) {
  node.analyser.getByteTimeDomainData(node.buffer);
  let peak = 0;
  for (let i = 0; i < node.buffer.length; i += 4) {
    const value = Math.abs(node.buffer[i] - 128);
    if (value > peak) {
      peak = value;
    }
  }
  return peak;
}

async function ensureMedia() {
  if (localStream !== null) {
    return true;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    const denied = error && error.name === 'NotAllowedError';
    toast(denied ? '麦克风权限被拒绝了' : '拿不到麦克风设备', true);
    return false;
  }
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
  const node = makeAnalyser(localStream);
  localAnalyser = node === null ? null : node.analyser;
  localBuffer = node === null ? null : node.buffer;
  return true;
}

function peerEntry(uid) {
  return peers.get(uid) ?? null;
}

function tuneSender(pc) {
  if (typeof pc.getSenders !== 'function') {
    return;
  }
  for (const sender of pc.getSenders()) {
    if (sender.track === null || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') {
      continue;
    }
    let params = null;
    try {
      params = sender.getParameters();
    } catch (error) {
      continue;
    }
    if (params === null) {
      continue;
    }
    if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = AUDIO_BITRATE;
    sender.setParameters(params).catch(() => {});
  }
}

function attachStream(uid, stream) {
  const entry = peerEntry(uid);
  if (entry === null || stream === null || stream === undefined) {
    return;
  }
  const sinks = $('#gcall-sinks');
  if (sinks === null) {
    return;
  }
  let audio = sinks.querySelector('[data-sink="' + uid + '"]');
  if (audio === null) {
    audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.dataset.sink = String(uid);
    sinks.appendChild(audio);
  }
  if (audio.srcObject !== stream) {
    audio.srcObject = stream;
  }
  entry.stream = stream;
  const play = audio.play();
  if (play !== undefined && typeof play.catch === 'function') {
    play.catch(() => {
      if (!warnedPlay) {
        warnedPlay = true;
        toast('浏览器拦住了自动播放，点一下群通话面板恢复声音', true);
      }
    });
  }
  if (entry.node === null) {
    const node = makeAnalyser(stream);
    entry.node = node;
  }
  renderList();
}

function removeSink(uid) {
  const sinks = $('#gcall-sinks');
  if (sinks === null) {
    return;
  }
  const audio = sinks.querySelector('[data-sink="' + uid + '"]');
  if (audio !== null) {
    audio.srcObject = null;
    audio.remove();
  }
}

function dropPeer(uid, keepTile) {
  const entry = peerEntry(uid);
  if (entry !== null) {
    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.onconnectionstatechange = null;
    try {
      entry.pc.close();
    } catch (error) {
    }
    peers.delete(uid);
  }
  removeSink(uid);
  if (!keepTile) {
    members.delete(uid);
    order = order.filter((id) => id !== uid);
  }
  renderList();
}

function createPeer(uid, initiator) {
  const known = peerEntry(uid);
  if (known !== null) {
    return known;
  }
  if (localStream === null) {
    return null;
  }
  let pc = null;
  try {
    pc = new RTCPeerConnection({ iceServers: iceServers() });
  } catch (error) {
    toast('这个浏览器建不了通话连接', true);
    return null;
  }
  const entry = {
    uid,
    pc,
    initiator,
    remoteSet: false,
    pending: [],
    offered: false,
    node: null,
    speaking: false,
    retrying: false,
  };
  peers.set(uid, entry);
  localStream.getAudioTracks().forEach((track) => pc.addTrack(track, localStream));
  pc.onicecandidate = (event) => {
    if (event.candidate !== null) {
      signal(uid, 'ice', event.candidate.toJSON());
    }
  };
  pc.ontrack = (event) => {
    const stream = event.streams && event.streams.length > 0
      ? event.streams[0]
      : new MediaStream([event.track]);
    attachStream(uid, stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      tuneSender(pc);
      entry.retrying = false;
      renderList();
    } else if (pc.connectionState === 'failed' && isActive() && !entry.retrying) {
      entry.retrying = true;
      toast('和 ' + nameOf(uid) + ' 之间没有可用通路，正在重试', true);
      window.setTimeout(() => renegotiate(uid), 2400);
    }
  };
  return entry;
}

function renegotiate(uid) {
  const entry = peerEntry(uid);
  if (entry === null || !isActive()) {
    return;
  }
  const wasInitiator = entry.initiator;
  dropPeer(uid, true);
  const fresh = createPeer(uid, wasInitiator);
  if (fresh !== null && fresh.initiator) {
    fresh.retrying = true;
    offer(fresh);
  }
}

async function signal(to, kind, payload) {
  if (!isActive()) {
    return;
  }
  await apiPost('api/groupcall.php', {
    action: 'signal',
    chat_id: chatId,
    to,
    kind,
    payload,
  }).catch(() => {});
}

async function flushIce(entry) {
  while (entry.pending.length > 0) {
    const candidate = entry.pending.shift();
    if (candidate === null || candidate === undefined) {
      continue;
    }
    await entry.pc.addIceCandidate(candidate).catch(() => {});
  }
}

async function offer(entry) {
  if (entry.offered || !isActive()) {
    return;
  }
  entry.offered = true;
  try {
    const desc = await entry.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await entry.pc.setLocalDescription(desc);
    await flushIce(entry);
    await signal(entry.uid, 'offer', {
      type: entry.pc.localDescription.type,
      sdp: entry.pc.localDescription.sdp,
    });
  } catch (error) {
    entry.offered = false;
  }
}

async function handleOffer(from, payload) {
  const existing = peerEntry(from);
  if (existing !== null && existing.initiator) {
    return;
  }
  const entry = existing ?? createPeer(from, false);
  if (entry === null || entry.pc.remoteDescription !== null) {
    return;
  }
  try {
    await entry.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    entry.remoteSet = true;
    await flushIce(entry);
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    await flushIce(entry);
    await signal(from, 'answer', {
      type: entry.pc.localDescription.type,
      sdp: entry.pc.localDescription.sdp,
    });
  } catch (error) {
  }
}

async function handleAnswer(from, payload) {
  const entry = peerEntry(from);
  if (entry === null || !entry.initiator || entry.pc.remoteDescription !== null) {
    return;
  }
  try {
    await entry.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    entry.remoteSet = true;
    await flushIce(entry);
  } catch (error) {
  }
}

async function handleIce(from, payload) {
  const entry = peerEntry(from);
  if (entry === null) {
    return;
  }
  if (!entry.remoteSet) {
    entry.pending.push(payload);
    return;
  }
  await entry.pc.addIceCandidate(payload).catch(() => {});
}

function negotiate() {
  if (!isActive() || localStream === null) {
    return;
  }
  const mine = order.indexOf(myId());
  order.forEach((uid, index) => {
    if (uid === myId() || peerEntry(uid) !== null) {
      return;
    }
    if (mine >= 0 && index > mine) {
      const entry = createPeer(uid, true);
      if (entry !== null) {
        offer(entry);
      }
    }
  });
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function renderList() {
  const list = $('#gcall-list');
  if (list === null || me === null) {
    return;
  }
  const ids = [myId(), ...order.filter((uid) => uid !== myId())];
  const markup = ids.map((uid) => {
    const user = uid === myId() ? me : members.get(uid);
    if (user === undefined) {
      return '';
    }
    const entry = peerEntry(uid);
    const isMe = uid === myId();
    const connected = entry !== null && entry.pc.connectionState === 'connected';
    const isMuted = isMe ? muted : user.muted === true;
    const speaking = !isMuted && (isMe ? localSpeaking : entry !== null && entry.speaking);
    const stateText = isMe ? '我' : (connected ? '已接通' : (entry === null ? '等待对方' : '连接中'));
    const stateClass = isMe || connected ? '' : ' is-wait';
    return '<div class="gcall-tile' + (speaking ? ' is-speaking' : '') + '" data-gcall-user="' + uid + '">' +
      avatarHtml({ id: user.id, nickname: user.nickname, avatar: user.avatar ?? '' }, 'avatar-sm', false, false) +
      '<span class="gcall-tile-name">' + esc(String(user.nickname ?? '')) + '</span>' +
      '<span class="gcall-tile-meta">' + levelChips(Number(user.level ?? 1)) +
      '<span class="gcall-tile-state' + stateClass + '">' + stateText + '</span></span>' +
      '<span class="gcall-tile-mic' + (isMuted ? ' is-off' : '') + '">' + (isMuted ? icon('micOff') : icon('mic')) + '</span>' +
      '</div>';
  }).join('');
  if (list.dataset.cache !== markup) {
    list.dataset.cache = markup;
    list.innerHTML = markup;
  }
  const count = $('#gcall-count');
  if (count !== null) {
    count.textContent = ids.length + '/' + MAX;
  }
  const title = $('#gcall-title');
  if (title !== null) {
    title.textContent = '群语音';
  }
}

function renderActions() {
  const box = $('#gcall-actions');
  if (box === null) {
    return;
  }
  const markup = '<button type="button" class="btn btn-sm gcall-btn' + (muted ? ' btn-primary' : '') + '" id="gcall-mute">' +
    (muted ? icon('micOff') : icon('mic')) + '<span>' + (muted ? '已静音' : '静音') + '</span></button>' +
    '<button type="button" class="btn btn-sm gcall-hangup" id="gcall-leave">' +
    icon('hangup') + '<span>离开</span></button>';
  if (box.dataset.cache !== markup) {
    box.dataset.cache = markup;
    box.innerHTML = markup;
  }
}

function sampleLevels() {
  if (isActive() && localAnalyser !== null && localBuffer !== null) {
    const speaking = !muted && peakOf({ analyser: localAnalyser, buffer: localBuffer }) > SPEAK_LEVEL;
    if (speaking !== localSpeaking) {
      localSpeaking = speaking;
      renderList();
    }
  }
  let changed = false;
  peers.forEach((entry) => {
    if (entry.node === null) {
      return;
    }
    const speaking = peakOf(entry.node) > SPEAK_LEVEL;
    if (speaking !== entry.speaking) {
      entry.speaking = speaking;
      changed = true;
    }
  });
  if (changed) {
    renderList();
  }
}

function tick() {
  const node = $('#gcall-time');
  if (node === null || (!isActive() && since === 0)) {
    return;
  }
  const base = since > 0 ? since : startedAt;
  node.textContent = fmtTime(Math.max(0, Math.floor(Date.now() / 1000) - base));
}

function startTimers() {
  stopTimers();
  tickTimer = window.setInterval(tick, 1000);
  levelTimer = window.setInterval(sampleLevels, 110);
  tick();
}

function stopTimers() {
  if (tickTimer !== null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
  if (levelTimer !== null) {
    window.clearInterval(levelTimer);
    levelTimer = null;
  }
}

function showPanel() {
  const box = panel();
  if (box === null) {
    return;
  }
  box.classList.remove('is-hidden');
  box.classList.toggle('is-collapsed', collapsed);
  const min = $('#gcall-min');
  if (min !== null) {
    min.title = collapsed ? '展开' : '收起';
  }
  renderList();
  renderActions();
  refreshBar();
}

function hidePanel() {
  const box = panel();
  if (box !== null) {
    box.classList.add('is-hidden');
  }
  const sinks = $('#gcall-sinks');
  if (sinks !== null) {
    sinks.innerHTML = '';
  }
  refreshBar();
}

function applyMembers(list) {
  const rows = Array.isArray(list) ? list : [];
  order = rows.map((user) => Number(user.id));
  rows.forEach((user) => {
    const uid = Number(user.id);
    const known = members.get(uid);
    members.set(uid, { ...(known ?? {}), ...user, id: uid });
  });
  Array.from(members.keys()).forEach((uid) => {
    if (!order.includes(uid)) {
      dropPeer(uid, false);
    }
  });
  negotiate();
  renderList();
}

async function handleSignal(item) {
  const from = Number(item.from);
  const payload = item.payload;
  if (payload === null || payload === undefined || from <= 0) {
    return;
  }
  if (item.kind === 'join') {
    const user = payload.user;
    if (user !== undefined && user !== null && Number(user.id) > 0 && Number(user.id) !== myId()) {
      members.set(Number(user.id), { ...user, id: Number(user.id) });
      if (!order.includes(Number(user.id))) {
        order.push(Number(user.id));
      }
      negotiate();
      renderList();
    }
    return;
  }
  if (item.kind === 'bye') {
    dropPeer(Number(payload.uid ?? from), false);
    return;
  }
  if (item.kind === 'state') {
    const user = members.get(Number(payload.uid ?? from));
    if (user !== undefined) {
      user.muted = payload.muted === true;
      renderList();
    }
    return;
  }
  if (item.kind === 'offer' && payload.sdp) {
    await handleOffer(from, payload);
    return;
  }
  if (item.kind === 'answer' && payload.sdp) {
    await handleAnswer(from, payload);
    return;
  }
  if (item.kind === 'ice') {
    await handleIce(from, payload);
  }
}

function interval() {
  const same = state.activeChat !== null && Number(state.activeChat.id) === chatId;
  return same && !collapsed ? NEAR : FAR;
}

async function poll() {
  if (!isActive()) {
    return;
  }
  if (busy) {
    schedule();
    return;
  }
  busy = true;
  const target = chatId;
  try {
    const res = await apiPost('api/groupcall.php', { action: 'poll', chat_id: target, after: lastSignal });
    busy = false;
    if (!isActive() || chatId !== target) {
      return;
    }
    const signals = Array.isArray(res.signals) ? res.signals : [];
    signals.forEach((item) => {
      if (Number(item.id) > lastSignal) {
        lastSignal = Number(item.id);
      }
      handleSignal(item).catch(() => {});
    });
    if (res.active !== true || res.in_call !== true) {
      const ended = res.active !== true;
      hangUp();
      toast(ended ? '群语音通话已结束' : '你已不在这个群通话里', true);
      return;
    }
    applyMembers(res.members ?? []);
    schedule();
  } catch (error) {
    busy = false;
    if (isActive()) {
      schedule();
    }
  }
}

function schedule() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
  }
  pollTimer = window.setTimeout(poll, interval());
}

export async function join(id) {
  const chat = Number(id);
  if (chat <= 0) {
    return;
  }
  if (isActive()) {
    if (chatId === chat) {
      collapsed = false;
      showPanel();
    } else {
      toast('你已经在一个群通话里了', true);
    }
    return;
  }
  if (callLayerOpen()) {
    toast('先结束当前的 1 对 1 通话', true);
    return;
  }
  if (!(await ensureMedia())) {
    return;
  }
  await refreshIce(true).catch(() => {});
  let res = null;
  try {
    res = await apiPost('api/groupcall.php', { action: 'join', chat_id: chat });
  } catch (error) {
    toast(error.message, true);
    return;
  }
  const rows = Array.isArray(res.members) ? res.members : [];
  const mine = rows.find((user) => Number(user.id) === Number((state.user ?? {}).id));
  me = mine ?? state.user;
  chatId = chat;
  muted = false;
  collapsed = false;
  busy = false;
  warnedPlay = false;
  lastSignal = Number(res.last ?? 0);
  since = Number(res.since ?? 0);
  startedAt = Math.floor(Date.now() / 1000);
  members = new Map();
  peers = new Map();
  applyMembers(rows);
  showPanel();
  startTimers();
  schedule();
  toast('已加入群语音通话');
}

export function hangUp() {
  if (!isActive()) {
    hidePanel();
    return;
  }
  const leaving = chatId;
  chatId = 0;
  order = [];
  Array.from(peers.keys()).forEach((uid) => dropPeer(uid, false));
  members = new Map();
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
  stopTimers();
  if (localStream !== null) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  localAnalyser = null;
  localBuffer = null;
  localSpeaking = false;
  if (audioCtx !== null) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  me = null;
  busy = false;
  hidePanel();
  apiPost('api/groupcall.php', { action: 'leave', chat_id: leaving }).catch(() => {});
}

export async function toggleMute() {
  if (!isActive()) {
    return;
  }
  muted = !muted;
  if (localStream !== null) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }
  renderList();
  renderActions();
  await apiPost('api/groupcall.php', { action: 'mute', chat_id: chatId, muted: muted ? '1' : '0' }).catch(() => {});
}

export function toggleCollapse() {
  collapsed = !collapsed;
  showPanel();
  schedule();
}

export function resumeAudio() {
  if (audioCtx !== null && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

export function debugState() {
  return {
    chat_id: chatId,
    last: lastSignal,
    busy,
    timer: pollTimer !== null,
    peers: Array.from(peers.keys()),
    order: order.slice(),
  };
}

function refreshBar() {
  const bar = $('#gcall-bar');
  if (bar === null) {
    return;
  }
  const chat = state.activeChat;
  const info = (state.groupCalls ?? []).find((item) => Number(item.chat_id) === Number((chat ?? {}).id));
  const show = chat !== null && chat !== undefined && chat.type === 'group'
    && !inThisChat(chat.id)
    && info !== undefined && info !== null && info.in_call !== true;
  if (!show) {
    bar.classList.add('is-hidden');
    return;
  }
  bar.classList.remove('is-hidden');
  const markup = '<span class="gcall-bar-dot"></span>' +
    '<span class="gcall-bar-text">群语音通话进行中 · ' + Number(info.members ?? 1) + ' 人</span>' +
    '<button type="button" class="btn btn-sm btn-primary" id="gcall-bar-join">' + icon('phone') + '<span>加入</span></button>';
  if (bar.dataset.cache !== markup) {
    bar.dataset.cache = markup;
    bar.innerHTML = markup;
  }
}

export function syncFromPoll(calls) {
  state.groupCalls = Array.isArray(calls) ? calls : [];
  refreshBar();
  if (!isActive()) {
    return;
  }
  const mine = state.groupCalls.find((item) => Number(item.chat_id) === chatId);
  if (mine === undefined) {
    hangUp();
    toast('群语音通话已结束');
  }
}

export function init() {
  const box = $('#gcall-panel');
  if (box === null) {
    return;
  }
  box.addEventListener('click', (event) => {
    if (event.target.closest('#gcall-mute') !== null) {
      toggleMute().catch(() => {});
      return;
    }
    if (event.target.closest('#gcall-leave') !== null) {
      hangUp();
      toast('已离开群语音通话');
      return;
    }
    if (event.target.closest('#gcall-min') !== null) {
      toggleCollapse();
      return;
    }
    const tile = event.target.closest('[data-gcall-user]');
    if (tile !== null) {
      const uid = Number(tile.dataset.gcallUser);
      if (uid > 0 && uid !== myId()) {
        emit('navigate', { name: 'profile', id: uid });
        return;
      }
    }
    resumeAudio();
  });
  const bar = $('#gcall-bar');
  if (bar !== null) {
    bar.addEventListener('click', (event) => {
      if (event.target.closest('#gcall-bar-join') === null) {
        return;
      }
      const chat = state.activeChat;
      if (chat !== null) {
        join(chat.id).catch(() => {});
      }
    });
  }
  on('chats', refreshBar);
  on('open-chat', refreshBar);
}
