import { state } from './state.js';
import { $, esc, avatarHtml, toast } from './util.js';
import { apiGet, apiPost } from './api.js';
import { icon } from './icons.js';
import { systemNotify } from './notify.js';

const FAST_POLL = 700;
const ACCEPT_WAIT = 40;
const ACCEPT_WAIT_STEP = 500;
const PUBLIC_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.miwifi.com:3478' },
  { urls: 'stun:stun.qq.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];

let turnRuntime = null;
let turnFetchedAt = 0;

export async function refreshIce(force = false) {
  if (!force && turnRuntime !== null && Date.now() - turnFetchedAt < 300000) {
    return turnRuntime;
  }
  const res = await apiGet('api/ice.php').catch(() => null);
  turnFetchedAt = Date.now();
  turnRuntime = res === null ? turnRuntime : res.turn;
  return turnRuntime;
}

export function iceServers() {
  const boot = window.PARLZ_BOOT ?? {};
  const custom = turnRuntime ?? boot.turn ?? null;
  if (custom && custom.host) {
    const auth = { username: custom.user ?? '', credential: custom.pass ?? '' };
    const port = custom.port ?? 3478;
    const transport = custom.transport ?? 'both';
    const urls = [];
    if (transport !== 'tcp') {
      urls.push('turn:' + custom.host + ':' + port + '?transport=udp');
    }
    if (transport !== 'udp') {
      urls.push('turn:' + custom.host + ':' + port + '?transport=tcp');
    }
    if (custom.tls) {
      urls.push('turns:' + custom.host + ':' + port + '?transport=tcp');
    }
    const stun = transport === 'tcp' ? [] : [{ urls: 'stun:' + custom.host + ':' + port }];
    return [
      ...stun,
      ...urls.map((url) => ({ urls: url, ...auth })),
      { urls: 'stun:stun.miwifi.com:3478' },
      { urls: 'stun:stun.qq.com:3478' },
    ];
  }
  return PUBLIC_ICE;
}

let current = null;
let pc = null;
let localStream = null;
let remoteStream = null;
let remoteDescSet = false;
let pendingIce = [];
let seenIce = 0;
let appliedAnswer = false;
let offerSent = false;
let fastTimer = null;
let timerTimer = null;
let ringCtx = null;
let ringTimer = null;
let lastToastStatus = '';
let notifiedIncoming = false;
let accepting = false;
let remoteVideoActive = false;
let avatarCache = '';
let actionsCache = '';
let lastIceError = '';
let candSeen = { host: 0, srflx: 0, relay: 0 };
let iceErrs = [];
let relayVerdict = null;
let probing = false;
let diagSentAt = 0;
let currentSince = 0;
let tickCount = 0;
const START_GRACE = 5000;

function sendDiag() {
  const now = Date.now();
  if (current === null || now - diagSentAt < 1500) {
    return;
  }
  diagSentAt = now;
  const data = JSON.stringify({
    role: current.role,
    status: current.status,
    pc: pc === null ? 0 : 1,
    sig: pc === null ? '' : pc.signalingState,
    ice: pc === null ? '' : pc.iceConnectionState,
    conn: pc === null ? '' : pc.connectionState,
    desc: remoteDescSet ? 1 : 0,
    seen: seenIce,
    pend: pendingIce.length,
    ans: appliedAnswer ? 1 : 0,
    off: offerSent ? 1 : 0,
    anLen: String((current.answer ?? '').length),
    err: lastIceError,
  });
  apiPost('api/call.php', { action: 'diag', id: current.id, data }).catch(() => {});
}

export function iceUrls() {
  return iceServers().map((server) => String(Array.isArray(server.urls) ? server.urls[0] : server.urls));
}

export function relayUrls() {
  return iceUrls().filter((url) => url.indexOf('turn') === 0);
}

export async function relayCheck(waitMs = 6000) {
  await refreshIce(true);
  const servers = iceServers().filter((server) => String(Array.isArray(server.urls) ? server.urls[0] : server.urls).indexOf('turn') === 0);
  if (servers.length === 0) {
    return { ok: false, url: '', ms: 0, errors: ['服务器没下发中继地址'] };
  }
  const started = Date.now();
  let relay = false;
  const errors = [];
  const pc = new RTCPeerConnection({ iceServers: servers });
  pc.onicecandidate = (event) => {
    if (event.candidate !== null && /\btyp relay\b/.test(event.candidate.candidate)) {
      relay = true;
    }
  };
  pc.onicecandidateerror = (event) => {
    const text = String(event.errorText ?? event.errorCode ?? '未知错误');
    const line = String(event.url ?? servers[0]) + ' → ' + text;
    if (!errors.includes(line)) {
      errors.push(line);
    }
  };
  try {
    pc.createDataChannel('parlz-relay-check');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const deadline = Date.now() + waitMs;
    while (!relay && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  } finally {
    pc.close();
  }
  return { ok: relay, url: iceUrls().filter((u) => u.indexOf('turn') === 0)[0] ?? '', ms: Date.now() - started, errors };
}

function resetCounters() {
  candSeen = { host: 0, srflx: 0, relay: 0 };
  iceErrs = [];
  relayVerdict = null;
  probing = false;
}

async function diagnoseFailure() {
  if (probing || relayVerdict !== null) {
    return;
  }
  probing = true;
  setStatusText('通路断了，正在检查中继…');
  renderCallUi();
  const result = await relayCheck(6000).catch(() => ({ ok: false, url: '', errors: ['检测失败'] }));
  probing = false;
  relayVerdict = result;
  sendDiag();
  renderCallUi();
}

export async function selfCheck(waitMs = 6000) {
  const types = { host: 0, srflx: 0, relay: 0 };
  const details = [];
  await refreshIce(true);
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  pc.onicecandidate = (event) => {
    if (event.candidate === null) {
      return;
    }
    const match = /\btyp (\w+)/.exec(event.candidate.candidate);
    const type = match === null ? 'other' : match[1];
    types[type] = (types[type] ?? 0) + 1;
    if (type !== 'other') {
      details.push(type + ' ' + (event.candidate.address || ''));
    }
  };
  pc.createDataChannel('parlz-check');
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  pc.close();
  return { types, details };
}

function dbg(...args) {
  if (window.PARLZ_DEBUG) {
    console.log('[parlz-call]', ...args);
  }
}

function remoteSdp(sdp) {
  const text = String(sdp ?? '');
  return text.endsWith('\n') ? text : text + '\r\n';
}

function layer() {
  return $('#call-layer');
}

function peerName() {
  return current && current.peer ? current.peer.nickname : '对方';
}

function setStatusText(text) {
  const node = $('#call-status');
  if (node !== null) {
    node.textContent = text;
  }
}

function relayVerdictText() {
  if (relayVerdict === null) {
    return '';
  }
  const lines = ['直连 ' + candSeen.host + ' · 公网 ' + candSeen.srflx + ' · 中继 ' + candSeen.relay];
  if (relayVerdict.ok) {
    lines.push('中继是通的，点绿色话筒重连');
  } else if (relayVerdict.url !== '') {
    lines.push('中继 ' + relayVerdict.url + ' 连不上');
    const first = (relayVerdict.errors ?? [])[0];
    if (typeof first === 'string' && first !== '') {
      lines.push(first);
    }
  } else {
    lines.push('服务器没下发中继地址');
  }
  return lines.join('　');
}

function renderCallUi() {
  const box = layer();
  if (box === null || current === null) {
    return;
  }
  const kindLabel = current.kind === 'video' ? '视频通话' : '语音通话';
  const active = current.status === 'active';
  const incoming = current.status === 'ringing' && current.role === 'callee';
  const outgoing = current.status === 'ringing' && current.role === 'caller';
  box.classList.remove('is-hidden');
  const localVideoReady = localStream !== null && localStream.getVideoTracks().length > 0;
  box.classList.toggle('is-video', active && current.kind === 'video' && (remoteVideoActive || localVideoReady));
  box.classList.toggle('is-active', active);
  const avatar = $('#call-avatar');
  const avatarMarkup = current.peer
    ? avatarHtml(current.peer, 'avatar-lg', false, false)
    : '';
  if (avatar !== null && avatarCache !== avatarMarkup) {
    avatarCache = avatarMarkup;
    avatar.innerHTML = avatarMarkup;
  }
  const name = $('#call-name');
  if (name !== null && name.textContent !== peerName()) {
    name.textContent = peerName();
  }
  if (incoming) {
    setStatusText(accepting ? '正在接通…' : '邀请你' + kindLabel);
  } else if (outgoing) {
    setStatusText('正在呼叫…');
  } else if (active) {
    if (relayVerdict !== null) {
      setStatusText(relayVerdictText());
    } else if (probing) {
      setStatusText('通路断了，正在检查中继…');
    } else if (pc !== null && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
      setStatusText('媒体连接已断开');
    } else if (pc !== null && pc.connectionState === 'connected') {
      updateTimer();
    } else {
      setStatusText('正在连接…');
    }
  }
  const actions = $('#call-actions');
  if (actions === null) {
    return;
  }
  let actionsMarkup = '';
  if (incoming) {
    actionsMarkup =
      '<button type="button" class="call-btn call-decline" data-call-act="decline" title="拒绝">' + icon('phone') + '</button>' +
      '<button type="button" class="call-btn call-accept" data-call-act="accept" title="接听">' + icon('phone') + '</button>';
  } else if (outgoing) {
    actionsMarkup =
      '<button type="button" class="call-btn call-decline" data-call-act="cancel" title="取消">' + icon('phone') + '</button>';
  } else if (active) {
    const muted = micMuted();
    const camOff = cameraOff();
    const hasCamera = current.kind === 'video' && localStream !== null && localStream.getVideoTracks().length > 0;
    if (relayVerdict !== null || probing) {
      actionsMarkup =
        '<button type="button" class="call-btn call-accept" data-call-act="retry" title="重连">' + icon('phone') + '</button>' +
        '<button type="button" class="call-btn call-decline" data-call-act="hangup" title="挂断">' + icon('hangup') + '</button>';
    } else {
    actionsMarkup =
      '<button type="button" class="call-btn' + (muted ? ' is-off' : '') + '" data-call-act="mute" title="' + (muted ? '取消静音' : '静音') + '">' + icon(muted ? 'micOff' : 'mic') + '</button>' +
      (hasCamera
        ? '<button type="button" class="call-btn' + (camOff ? ' is-off' : '') + '" data-call-act="camera" title="' + (camOff ? '打开摄像头' : '关闭摄像头') + '">' + icon(camOff ? 'camOff' : 'video') + '</button>'
        : '') +
      '<button type="button" class="call-btn call-decline" data-call-act="hangup" title="挂断">' + icon('phone') + '</button>';
    }
  }
  if (actionsCache !== actionsMarkup) {
    actionsCache = actionsMarkup;
    actions.innerHTML = actionsMarkup;
  }
}

function micMuted() {
  const track = localStream && localStream.getAudioTracks()[0];
  return track ? !track.enabled : false;
}

function cameraOff() {
  const track = localStream && localStream.getVideoTracks()[0];
  return track ? !track.enabled : false;
}

function updateTimer() {
  const node = $('#call-status');
  if (node === null || current === null || current.status !== 'active') {
    return;
  }
  if (pc !== null && pc.connectionState !== 'connected') {
    return;
  }
  const started = current.answered_at || Math.floor(Date.now() / 1000);
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - started);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  node.textContent = mm + ':' + ss;
}

function startTimer() {
  if (timerTimer !== null) {
    return;
  }
  timerTimer = window.setInterval(updateTimer, 1000);
  updateTimer();
}

function stopTimer() {
  if (timerTimer !== null) {
    window.clearInterval(timerTimer);
    timerTimer = null;
  }
}

function ringStart() {
  if (ringCtx !== null) {
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }
    ringCtx = new Ctx();
    const beep = () => {
      if (ringCtx === null) {
        return;
      }
      const osc = ringCtx.createOscillator();
      const gain = ringCtx.createGain();
      osc.connect(gain);
      gain.connect(ringCtx.destination);
      osc.frequency.value = 620;
      const now = ringCtx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 0.35);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.45);
    };
    beep();
    ringTimer = window.setInterval(beep, 1800);
  } catch (error) {
    ringCtx = null;
  }
}

function ringStop() {
  if (ringTimer !== null) {
    window.clearInterval(ringTimer);
    ringTimer = null;
  }
  if (ringCtx !== null) {
    try {
      ringCtx.close();
    } catch (error) {
      ringCtx = null;
    }
    ringCtx = null;
  }
}

function stopFast() {
  if (fastTimer !== null) {
    window.clearInterval(fastTimer);
    fastTimer = null;
  }
}

function engage() {
  if (fastTimer === null) {
    fastTimer = window.setInterval(fastTick, FAST_POLL);
  }
}

function cleanupMedia() {
  ringStop();
  stopFast();
  stopTimer();
  if (pc !== null) {
    try {
      pc.close();
    } catch (error) {
      pc = null;
    }
    pc = null;
  }
  if (localStream !== null) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  remoteStream = null;
  remoteDescSet = false;
  pendingIce = [];
  seenIce = 0;
  appliedAnswer = false;
  offerSent = false;
  remoteVideoActive = false;
  avatarCache = '';
  actionsCache = '';
  const box = layer();
  if (box !== null) {
    box.classList.add('is-hidden');
    box.classList.remove('is-video', 'is-active');
    box.dataset.needsPlay = '';
  }
  const remoteVideo = $('#call-remote-video');
  if (remoteVideo !== null) {
    remoteVideo.srcObject = null;
    remoteVideo.classList.add('is-hidden');
  }
  const localVideo = $('#call-local-video');
  if (localVideo !== null) {
    localVideo.srcObject = null;
    localVideo.classList.add('is-hidden');
  }
  const audio = $('#call-remote-audio');
  if (audio !== null) {
    audio.srcObject = null;
  }
}

function finish(reasonStatus) {
  if (current !== null) {
    const role = current.role;
    const messages = {
      declined: role === 'caller' ? '对方已拒绝' : '已拒绝通话',
      canceled: role === 'callee' ? '对方已取消' : '已取消通话',
      missed: role === 'caller' ? '对方无应答' : '未接来电',
      ended: '通话已结束',
    };
    if (lastToastStatus !== reasonStatus && messages[reasonStatus]) {
      toast(messages[reasonStatus]);
    }
    lastToastStatus = reasonStatus ?? '';
  }
  current = null;
  notifiedIncoming = false;
  resetCounters();
  cleanupMedia();
}

export function callFromPoll(light) {
  if (light === null) {
    if (current !== null && Date.now() - currentSince > START_GRACE) {
      current = null;
      cleanupMedia();
    }
    if (current === null) {
      lastToastStatus = '';
    }
    return;
  }
  if (current !== null && light.id !== current.id && Date.now() - currentSince < START_GRACE) {
    return;
  }
  applyLight(light);
}

function applyLight(light) {
  const prevStatus = current === null ? '' : current.status;
  if (current === null || current.id !== light.id) {
    currentSince = Date.now();
  }
  current = { ...(current ?? {}), ...light };
  dbg('poll', light.id, light.status, light.role);
  sendDiag();
  if (light.status === 'ringing' || light.status === 'active') {
    engage();
    renderCallUi();
    if (light.status === 'ringing') {
      ringStart();
      if (light.role === 'callee' && !notifiedIncoming) {
        notifiedIncoming = true;
        if (document.hidden && light.peer) {
          systemNotify('来' + (light.kind === 'video' ? '视频' : '电话'), light.peer.nickname + ' 邀请你' + (light.kind === 'video' ? '视频通话' : '语音通话'));
        }
        if (navigator.vibrate) {
          try {
            navigator.vibrate([280, 180, 280, 180, 280]);
          } catch (error) {
            notifiedIncoming = true;
          }
        }
      }
    } else {
      ringStop();
      startTimer();
    }
    if (prevStatus !== light.status) {
      lastToastStatus = '';
    }
    return;
  }
  if (current !== null && current.id !== light.id && Date.now() - currentSince < START_GRACE) {
    return;
  }
  finish(light.status);
}

const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true };
const VIDEO_CONSTRAINTS = { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' };
const VIDEO_MAX_BITRATE = 700000;
const AUDIO_MAX_BITRATE = 40000;

async function getMedia(wantVideo) {
  if (!wantVideo) {
    return navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS });
  } catch (error) {
    if (error && error.name === 'NotAllowedError') {
      throw error;
    }
    toast('没有可用的摄像头，这次用语音通话');
    return navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
  }
}

async function ensureMedia() {
  if (localStream !== null) {
    return true;
  }
  try {
    localStream = await getMedia(current.kind === 'video');
  } catch (error) {
    const denied = error && error.name === 'NotAllowedError';
    toast(denied ? '麦克风/摄像头权限被拒绝了' : '拿不到麦克风设备', true);
    return false;
  }
  const localVideo = $('#call-local-video');
  if (localVideo !== null && localStream.getVideoTracks().length > 0) {
    localVideo.srcObject = localStream;
    localVideo.classList.remove('is-hidden');
  }
  return true;
}

function createPeer() {
  if (pc !== null) {
    return pc;
  }
  pc = new RTCPeerConnection({ iceServers: iceServers() });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  pc.onicecandidate = (event) => {
    if (event.candidate !== null && current !== null) {
      const match = /\btyp (\w+)/.exec(event.candidate.candidate);
      const type = match === null ? 'other' : match[1];
      if (candSeen[type] !== undefined) {
        candSeen[type] += 1;
      }
      apiPost('api/call.php', { action: 'ice', id: current.id, candidate: event.candidate.toJSON() }).catch(() => {});
    }
  };
  pc.onicecandidateerror = (event) => {
    const line = String(event.url ?? '') + ' → ' + String(event.errorText ?? event.errorCode ?? '失败');
    lastIceError = line;
    if (!iceErrs.includes(line)) {
      iceErrs.push(line);
    }
  };
  pc.ontrack = (event) => {
    remoteStream = event.streams[0] ?? remoteStream;
    if (event.track && event.track.kind === 'video') {
      remoteVideoActive = true;
    }
    playRemote();
    renderCallUi();
  };
  pc.onconnectionstatechange = () => {
    if (pc === null) {
      return;
    }
    if (pc.connectionState === 'connected') {
      tuneSenders();
      renderCallUi();
    } else if (pc.connectionState === 'failed') {
      diagnoseFailure().catch(() => {});
    }
  };
  return pc;
}

function tuneSenders() {
  if (pc === null || typeof pc.getSenders !== 'function') {
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
    if (sender.track.kind === 'video') {
      params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
      params.encodings[0].maxFramerate = 24;
      params.degradationPreference = 'maintain-framerate';
    } else {
      params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
    }
    sender.setParameters(params).catch(() => {});
  }
}

function playRemote() {
  const audio = $('#call-remote-audio');
  const video = $('#call-remote-video');
  if (audio !== null && audio.srcObject !== remoteStream) {
    audio.srcObject = remoteStream;
  }
  if (video !== null && current !== null && current.kind === 'video') {
    if (video.srcObject !== remoteStream) {
      video.srcObject = remoteStream;
    }
    video.classList.remove('is-hidden');
  }
  if (audio !== null) {
    audio.play().catch(() => {
      toast('浏览器拦住了自动播放，点一下通话界面恢复声音', true);
      const box = layer();
      if (box !== null) {
        box.dataset.needsPlay = '1';
      }
    });
  }
  if (video !== null && current !== null && current.kind === 'video') {
    video.play().catch(() => {});
  }
}

function resumePlayback() {
  const box = layer();
  if (box === null || box.dataset.needsPlay !== '1') {
    return;
  }
  box.dataset.needsPlay = '';
  const audio = $('#call-remote-audio');
  if (audio !== null) {
    audio.play().catch(() => {});
  }
  const video = $('#call-remote-video');
  if (video !== null) {
    video.play().catch(() => {});
  }
}

async function flushPendingIce() {
  for (const candidate of pendingIce) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      lastIceError = 'flush:' + (error && error.message ? error.message : 'fail');
    }
  }
  pendingIce = [];
}

async function handlePeerIce(list) {
  if (pc === null || !Array.isArray(list)) {
    return;
  }
  while (seenIce < list.length) {
    const candidate = list[seenIce];
    seenIce += 1;
    if (candidate === null) {
      continue;
    }
    if (!remoteDescSet) {
      pendingIce.push(candidate);
      continue;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      lastIceError = 'add:' + (error && error.message ? error.message : 'fail');
    }
  }
}

async function waitGathering(capMs = 3000) {
  if (pc === null || pc.iceGatheringState === 'complete') {
    return;
  }
  const target = pc;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      target.removeEventListener('icegatheringstatechange', onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (target.iceGatheringState === 'complete') {
        finish();
      }
    };
    const timer = window.setTimeout(finish, capMs);
    target.addEventListener('icegatheringstatechange', onChange);
  });
}

async function localSdp(capMs = 3000) {
  await waitGathering(capMs);
  return pc !== null && pc.localDescription !== null ? pc.localDescription.sdp : '';
}

async function negotiate(full) {
  if (current === null) {
    return;
  }
  const callId = current.id;
  if (current.role === 'caller' && current.status === 'ringing' && !offerSent) {
    const ok = await ensureMedia();
    if (!ok) {
      cancelOrHangup();
      return;
    }
    createPeer();
    tuneSenders();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    offerSent = true;
    const offerSdp = await localSdp();
    dbg('offer ready', callId, offerSdp.length, /a=candidate/.test(offerSdp));
    if (current === null || current.id !== callId) {
      return;
    }
    const res = await apiPost('api/call.php', { action: 'offer', id: callId, sdp: offerSdp });
    dbg('offer posted', callId);
    if (res.call && current !== null && current.id === callId) {
      current = { ...current, ...res.call };
    }
  }
  if (current === null) {
    return;
  }
  if (current.role === 'caller' && full.answer && !appliedAnswer) {
    if (pc === null) {
      const ok = await ensureMedia();
      if (!ok) {
        cancelOrHangup();
        return;
      }
      createPeer();
    }
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: remoteSdp(full.answer) });
      dbg('answer applied', full.answer.length);
      appliedAnswer = true;
      remoteDescSet = true;
      await flushPendingIce();
    } catch (error) {
      appliedAnswer = true;
      lastIceError = 'rd-answer:' + (error && error.message ? error.message : 'fail');
    }
  }
  await handlePeerIce(full.ice);
}

async function acceptCall() {
  if (accepting || current === null || current.role !== 'callee' || current.status !== 'ringing') {
    return;
  }
  accepting = true;
  const callId = current.id;
  dbg('accept start', callId, current.status, current.role);
  lastIceError = '';
  setStatusText('正在接通…');
  await refreshIce();
  try {
    let offerSdp = '';
    for (let attempt = 0; attempt < ACCEPT_WAIT; attempt++) {
      if (current === null || current.id !== callId || current.status !== 'ringing') {
        return;
      }
      const full = await apiGet('api/call.php').catch(() => null);
      dbg('accept poll', attempt, full && full.call ? (String(full.call.id) + '/' + full.call.status + '/offer=' + (full.call.offer || '').length) : 'null');
      if (full && full.call) {
        current = { ...current, ...full.call };
        offerSdp = full.call.offer || '';
        if (offerSdp !== '') {
          break;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, ACCEPT_WAIT_STEP));
    }
    if (current === null || current.id !== callId || current.status !== 'ringing') {
      return;
    }
    if (offerSdp === '') {
      toast('对方还没准备好通话，已取消', true);
      await apiPost('api/call.php', { action: 'decline', id: callId }).catch(() => {});
      finish('ended');
      return;
    }
    const ok = await ensureMedia();
    if (!ok) {
      await apiPost('api/call.php', { action: 'decline', id: callId }).catch(() => {});
      finish('declined');
      return;
    }
    createPeer();
    tuneSenders();
    const lines = offerSdp.split('\r\n');
    dbg('offer detail', offerSdp.length, 'lines=' + lines.length, 'last=' + lines[lines.length - 1].length, 'tail=' + JSON.stringify(offerSdp.slice(-2)));
    await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp(offerSdp) });
    remoteDescSet = true;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await flushPendingIce();
    const answerSdp = await localSdp();
    dbg('answer ready', callId, answerSdp.length);
    const res = await apiPost('api/call.php', { action: 'answer', id: callId, sdp: answerSdp });
    dbg('answer posted', callId);
    if (current !== null && current.id === callId) {
      if (res.call) {
        current = { ...current, ...res.call };
      }
      ringStop();
      renderCallUi();
      startTimer();
    }
  } catch (error) {
    dbg('accept error', error && error.message);
    toast('接听失败：' + error.message, true);
    await apiPost('api/call.php', { action: 'decline', id: callId }).catch(() => {});
    if (current !== null && current.id === callId) {
      finish('ended');
    }
  } finally {
    accepting = false;
  }
}

async function fastTick() {
  if (current === null || (current.status !== 'ringing' && current.status !== 'active')) {
    stopFast();
    return;
  }
  tickCount += 1;
  if (pc !== null && pc.connectionState === 'connected' && tickCount % 3 !== 0) {
    return;
  }
  let res = null;
  try {
    res = await apiGet('api/call.php');
  } catch (error) {
    return;
  }
  if (res === null || !res.call) {
    if (current !== null && Date.now() - currentSince > START_GRACE) {
      finish('ended');
    }
    return;
  }
  if (current !== null && res.call.id !== current.id && Date.now() - currentSince < START_GRACE) {
    return;
  }
  const prevStatus = current.status;
  current = { ...current, ...res.call };
  sendDiag();
  if (res.call.status === 'ringing' || res.call.status === 'active') {
    if (prevStatus === 'ringing' && res.call.status === 'active') {
      ringStop();
      startTimer();
    }
    renderCallUi();
    await negotiate(res.call);
    return;
  }
  finish(res.call.status);
}

function cancelOrHangup() {
  if (current === null) {
    return;
  }
  const action = current.role === 'caller' && current.status === 'ringing' ? 'cancel' : 'hangup';
  apiPost('api/call.php', { action, id: current.id }).catch(() => {});
  finish(action === 'cancel' ? 'canceled' : 'ended');
}

function hangup() {
  cancelOrHangup();
}

export async function start(peerId, kind) {
  if (current !== null && (current.status === 'ringing' || current.status === 'active')) {
    toast('你正在通话中', true);
    return;
  }
  resetCounters();
  await refreshIce();
  try {
    const res = await apiPost('api/call.php', { action: 'start', user_id: peerId, kind });
    current = res.call;
    dbg('start ok', res.call && res.call.id, res.call && res.call.status);
    currentSince = Date.now();
    lastToastStatus = '';
    lastIceError = '';
    notifiedIncoming = false;
    engage();
    renderCallUi();
    ringStart();
  } catch (error) {
    toast(error.message, true);
  }
}

function actionsClick(event) {
  resumePlayback();
  const button = event.target.closest('[data-call-act]');
  if (button === null || current === null) {
    return;
  }
  const act = button.dataset.callAct;
  if (act === 'decline') {
    apiPost('api/call.php', { action: 'decline', id: current.id }).catch(() => {});
    finish('declined');
    return;
  }
  if (act === 'cancel' || act === 'hangup') {
    cancelOrHangup();
    return;
  }
  if (act === 'accept') {
    acceptCall().catch(() => {});
    return;
  }
  if (act === 'retry') {
    const peerId = current.peer ? current.peer.id : 0;
    const kind = current.kind === 'video' ? 'video' : 'audio';
    cancelOrHangup();
    if (peerId > 0) {
      window.setTimeout(() => {
        start(peerId, kind).catch(() => {});
      }, 600);
    }
    return;
  }
  if (act === 'mute') {
    const track = localStream && localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      renderCallUi();
    }
    return;
  }
  if (act === 'camera') {
    const track = localStream && localStream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      const localVideo = $('#call-local-video');
      if (localVideo !== null) {
        localVideo.classList.toggle('is-hidden', !track.enabled);
      }
      renderCallUi();
    }
  }
}

export function init() {
  const box = layer();
  if (box !== null) {
    box.addEventListener('click', actionsClick);
  }
}
