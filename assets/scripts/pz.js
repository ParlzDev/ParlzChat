import { state, emit } from './state.js';
import { toast, uidName, uidUserId } from './util.js';
import { apiPost } from './api.js';
import { addByUid, joinGroup } from './scanner.js';

const COMMANDS = ['login', 'adduser', 'adda', 'chat', 'profile', 'scan', 'share'];

function groupChatId(raw) {
  const match = /^[AG]0*(\d{1,12})$/i.exec(String(raw ?? '').trim());
  return match === null ? 0 : Number(match[1]);
}

function userCode(raw) {
  const value = String(raw ?? '').trim().toUpperCase();
  return /^U\d{1,12}$/.test(value) ? value : '';
}

function normalize(raw) {
  let value = String(raw ?? '').trim();
  if (value === '') {
    return null;
  }
  const wrapped = /[?&#]pz=([^&#]+)/i.exec(value) ?? /^https?:\/\/[^?#]*[#?]pz=([^&#]+)/i.exec(value);
  if (wrapped !== null) {
    try {
      value = decodeURIComponent(wrapped[1]);
    } catch (error) {
      return null;
    }
  }
  const hashForm = /^#?pz:(.+)$/i.exec(value);
  if (hashForm !== null) {
    value = 'pz:' + hashForm[1];
  }
  if (!/^pz:\/{0,2}/i.test(value)) {
    return null;
  }
  const body = value.replace(/^pz:\/{0,2}/i, '');
  const split = body.indexOf('?');
  const name = (split === -1 ? body : body.slice(0, split)).trim().toLowerCase();
  if (COMMANDS.indexOf(name) === -1) {
    return null;
  }
  const params = {};
  const query = split === -1 ? '' : body.slice(split + 1);
  const tokens = query.split('&').map((token) => token.trim()).filter((token) => token !== '');
  for (let i = 0; i < tokens.length; i += 1) {
    const eq = tokens[i].indexOf('=');
    if (eq === -1) {
      const key = tokens[i].toLowerCase();
      if (key === 'code') {
        const next = tokens[i + 1] ?? '';
        if (next !== '' && next.indexOf('=') === -1) {
          params.code = decodeURIComponent(next);
          i += 1;
          continue;
        }
        continue;
      }
      params[key] = '1';
      continue;
    }
    params[tokens[i].slice(0, eq).toLowerCase()] = decodeURIComponent(tokens[i].slice(eq + 1));
  }
  if (params.code === undefined && tokens.length === 1 && tokens[0].indexOf('=') === -1) {
    params.code = tokens[0];
  }
  return { cmd: name, params };
}

export function parsePz(raw) {
  return normalize(raw);
}

export function pzLink(cmd, code) {
  const name = String(cmd ?? '').toLowerCase();
  if (COMMANDS.indexOf(name) === -1) {
    return '';
  }
  return code === undefined || code === '' ? 'pz:' + name : 'pz:' + name + '?code=' + encodeURIComponent(String(code));
}

function needLogin() {
  toast('先在设备上登录 Parlz，再打开这个链接', true);
}

async function openChatByUser(uid) {
  const userId = uidUserId(uid);
  if (userId <= 0) {
    toast('这个用户码不对', true);
    return false;
  }
  const want = uidName(uid);
  const found = (state.chats ?? []).find((chat) => uidName(chat.uid) === want);
  if (found !== undefined) {
    emit('open-chat', Number(found.id));
    return true;
  }
  try {
    const res = await apiPost('api/chats.php', { action: 'open', user_id: userId });
    const chats = await import('./chats.js');
    await chats.refresh();
    chats.open(Number(res.chat_id));
    return true;
  } catch (error) {
    toast(error.message, true);
    return false;
  }
}

async function runCommand(target) {
  const { cmd, params } = target;
  const code = String(params.code ?? '').trim();
  if (cmd === 'scan') {
    const mod = await import('./scanner.js');
    await mod.openScanner();
    return true;
  }
  if (state.user === null) {
    needLogin();
    return false;
  }
  if (cmd === 'login') {
    if (!/^[a-f0-9]{8,64}$/i.test(code)) {
      toast('登录码不对', true);
      return false;
    }
    try {
      await apiPost('api/auth.php', { action: 'scan-confirm', code });
      toast('已确认在另一台设备登录');
      return true;
    } catch (error) {
      toast(error.message, true);
      return false;
    }
  }
  if (cmd === 'adduser') {
    const uid = userCode(code);
    if (uid === '') {
      toast('用户码要形如 U00312', true);
      return false;
    }
    await addByUid(uid);
    return true;
  }
  if (cmd === 'adda') {
    const chatId = groupChatId(code);
    if (chatId <= 0) {
      toast('群号要形如 A00276', true);
      return false;
    }
    await joinGroup(chatId);
    return true;
  }
  if (cmd === 'chat') {
    const chatId = groupChatId(code);
    if (chatId > 0) {
      emit('open-chat', chatId);
      return true;
    }
    const uid = userCode(code);
    if (uid !== '') {
      return await openChatByUser(uid);
    }
    toast('给的不是用户码也不是群号', true);
    return false;
  }
  if (cmd === 'profile') {
    const uid = userCode(code);
    const userId = uidUserId(uid);
    if (userId <= 0) {
      toast('用户码要形如 U00312', true);
      return false;
    }
    emit('navigate', { name: 'profile', id: userId });
    return true;
  }
  if (cmd === 'share') {
    const chatId = groupChatId(code);
    if (chatId > 0) {
      const drawer = await import('./drawer.js');
      drawer.openGroupInfo(chatId);
      return true;
    }
    const contacts = await import('./contacts.js');
    contacts.openMyCode();
    return true;
  }
  return false;
}

export async function runPz(raw) {
  const target = normalize(raw);
  if (target === null) {
    return false;
  }
  try {
    return await runCommand(target);
  } catch (error) {
    toast('pz 链接打不开：' + (error && error.message ? error.message : '未知错误'), true);
    return false;
  }
}

export function pendingPz() {
  const fromSearch = new URLSearchParams(window.location.search).get('pz');
  if (fromSearch !== null && fromSearch !== '') {
    return fromSearch;
  }
  return window.location.hash.indexOf('pz:') === 0 ? window.location.hash.slice(1) : '';
}

export function consumePz() {
  const raw = window.sessionStorage.getItem('parlz:pending-pz') || pendingPz();
  window.sessionStorage.removeItem('parlz:pending-pz');
  if (raw === '') {
    return;
  }
  const clean = new URL(window.location.href);
  clean.searchParams.delete('pz');
  window.history.replaceState({ parlz: true }, '', clean.pathname + (clean.search === '' ? '' : clean.search));
  if (clean.hash.indexOf('#pz:') === 0) {
    window.history.replaceState({ parlz: true }, '', clean.pathname + clean.search);
  }
  runPz(raw).catch(() => {});
}

export function stashPz() {
  const raw = pendingPz();
  if (raw !== '') {
    window.sessionStorage.setItem('parlz:pending-pz', raw);
  }
}

export function commandTable() {
  return [
    ['pz:login?code=<12位码>', '确认另一台设备的登录（等同扫登录码）'],
    ['pz:AddUser?code=<U码>', '添加好友'],
    ['pz:AddA?code=<A码>', '加入群聊（开放直接进，需审批则提交申请）'],
    ['pz:Chat?code=<U码或A码>', '打开与某人或某群的会话'],
    ['pz:Profile?code=<U码>', '查看资料页'],
    ['pz:Scan', '打开扫一扫'],
    ['pz:Share?code=<A码>', '分享群（不给 code 就分享我的码）'],
  ];
}

export function installPzBridge() {
  window.ParlzPz = (raw) => {
    runPz(raw).catch(() => {});
  };
}
