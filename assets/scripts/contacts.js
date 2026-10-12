import { state, emit } from './state.js';
import { $, esc, avatarHtml, toast, paintPanel } from './util.js';
import { apiGet, apiPost } from './api.js';
import * as drawer from './drawer.js';

let searchResults = null;
let searchTimer = null;

export async function refresh() {
  const res = await apiGet('api/friends.php');
  state.friends = res.friends;
  state.requests = res.requests;
  state.outgoing = res.outgoing;
  emit('contacts');
}

export async function refreshGroups() {
  const res = await apiGet('api/groups.php');
  state.groups = res.groups;
  emit('contacts');
}

function friendRow(friend) {
  const name = friend.remark ? friend.remark : friend.nickname;
  return '<div class="row" data-act="ct-dm" data-id="' + friend.id + '">' + avatarHtml(friend, 'avatar-sm', friend.online, true) +
    '<span class="row-main"><span class="row-name">' + esc(name) + '</span>' +
    '<span class="row-sub">@' + esc(friend.username) + (friend.bio ? ' · ' + esc(friend.bio) : '') + '</span></span>' +
    '<span class="row-actions"><button type="button" class="btn btn-sm" data-act="ct-dm" data-id="' + friend.id + '">发消息</button></span></div>';
}

function searchRow(user) {
  let action = '<button type="button" class="btn btn-sm btn-primary" data-act="ct-request" data-id="' + user.id + '">加好友</button>';
  if (user.relation === 'friend') {
    action = '<button type="button" class="btn btn-sm" data-act="ct-dm" data-id="' + user.id + '">发消息</button>';
  } else if (user.relation === 'outgoing') {
    action = '<span class="pending-tag">待验证</span>';
  } else if (user.relation === 'incoming') {
    action = '<button type="button" class="btn btn-sm btn-primary" data-act="ct-accept" data-id="' + user.id + '">接受</button>';
  }
  return '<div class="row">' + avatarHtml(user, 'avatar-sm', user.online, true) +
    '<span class="row-main"><span class="row-name">' + esc(user.nickname) + '</span>' +
    '<span class="row-sub mono">@' + esc(user.username) + '</span></span>' +
    '<span class="row-actions">' + action + '</span></div>';
}

function renderSearch() {
  let html = '';
  if (state.searchQuery.trim() === '') {
    html = '<p class="empty-note">输入用户名或昵称，找到对方加为好友</p>';
  } else if (searchResults === null) {
    html = '<p class="empty-note">搜索中…</p>';
  } else if (searchResults.length === 0) {
    html = '<p class="empty-note">没有找到这个用户</p>';
  } else {
    html = '<div class="list-head">搜索结果</div>' + searchResults.map(searchRow).join('');
  }
  paintPanel('contacts', html);
}

export function render() {
  if (state.searchQuery.trim() !== '') {
    renderSearch();
    return;
  }

  let html = '';
  if (state.requests.length > 0) {
    html += '<div class="list-head">好友请求 · ' + state.requests.length + '</div>';
    html += state.requests.map((user) =>
      '<div class="row">' + avatarHtml(user, 'avatar-sm', user.online) +
      '<span class="row-main"><span class="row-name">' + esc(user.nickname) + '</span>' +
      '<span class="row-sub mono">@' + esc(user.username) + '</span></span>' +
      '<span class="row-actions">' +
      '<button type="button" class="btn btn-sm btn-primary" data-act="ct-accept" data-id="' + user.id + '">接受</button>' +
      '<button type="button" class="btn btn-sm" data-act="ct-decline" data-id="' + user.id + '">拒绝</button>' +
      '</span></div>').join('');
  }

  html += '<div class="list-head">群聊 · ' + state.groups.length + '</div>';
  html += state.groups.length === 0
    ? '<p class="empty-note">还没有群聊，点右上角 + 发起</p>'
    : state.groups.map((group) =>
      '<div class="row" data-act="ct-open" data-id="' + group.id + '">' + avatarHtml({ id: group.id, nickname: group.name, avatar: '' }, 'avatar-sm') +
      '<span class="row-main"><span class="row-name">' + esc(group.name) + '</span>' +
      '<span class="row-sub mono">' + esc(group.uid ?? '') + '</span>' +
      '<span class="row-sub">' + group.members + ' 人' + (group.is_owner ? ' · 我创建的' : '') + (group.is_default ? ' · 默认群' : '') + '</span></span></div>').join('');

  html += '<div class="list-head">好友 · ' + state.friends.length + '</div>';
  html += state.friends.length === 0
    ? '<p class="empty-note">还没有好友，搜索用户名添加对方</p>'
    : state.friends.map(friendRow).join('');

  if (state.outgoing.length > 0) {
    html += '<div class="list-head">待验证</div>';
    html += state.outgoing.map((user) =>
      '<div class="row">' + avatarHtml(user, 'avatar-sm', user.online) +
      '<span class="row-main"><span class="row-name">' + esc(user.nickname) + '</span>' +
      '<span class="row-sub mono">@' + esc(user.username) + '</span></span>' +
      '<span class="row-actions"><button type="button" class="btn btn-sm" data-act="ct-cancel" data-id="' + user.id + '" data-label="撤回">撤回</button></span></div>').join('');
  }

  paintPanel('contacts', html);
}

async function runSearch(query) {
  if (state.view !== 'contacts' || query === '') {
    searchResults = null;
    return;
  }
  try {
    const res = await apiGet('api/friends.php', { q: query });
    if (state.searchQuery.trim() !== query) {
      return;
    }
    searchResults = res.results;
  } catch {
    searchResults = [];
  }
  if (state.view === 'contacts') {
    render();
  }
}

export function init() {
  $('#panel-search').addEventListener('input', (event) => {
    if (state.view !== 'contacts') {
      return;
    }
    const query = event.target.value.trim();
    state.searchQuery = event.target.value;
    searchResults = null;
    render();
    window.clearTimeout(searchTimer);
    if (query === '') {
      return;
    }
    searchTimer = window.setTimeout(() => runSearch(query), 260);
  });

  $('#panel-body').addEventListener('click', (event) => {
    if (event.target.closest('[data-user]') !== null) {
      return;
    }
    const target = event.target.closest('[data-act]');
    if (target === null || state.view !== 'contacts') {
      return;
    }
    const id = Number(target.dataset.id ?? 0);
    const act = target.dataset.act;

    if (act === 'ct-dm') {
      openDm(id);
    } else if (act === 'ct-open') {
      emit('open-chat', id);
    } else if (act === 'ct-request') {
      apiPost('api/friends.php', { action: 'request', user_id: id })
        .then(async (res) => {
          toast(res.accepted ? '你们已成为好友' : '好友申请已发送');
          searchResults = null;
          await refresh();
          await runSearch(state.searchQuery.trim());
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'ct-accept') {
      apiPost('api/friends.php', { action: 'accept', user_id: id })
        .then(async () => {
          toast('已添加为好友');
          await refresh();
          await runSearch(state.searchQuery.trim());
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'ct-decline') {
      apiPost('api/friends.php', { action: 'decline', user_id: id })
        .then(async () => {
          toast('已拒绝该请求');
          await refresh();
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'ct-cancel') {
      apiPost('api/friends.php', { action: 'remove', user_id: id })
        .then(async () => {
          toast('已撤回申请');
          await refresh();
        })
        .catch((error) => toast(error.message, true));
    }
  });
}

async function openDm(userId) {
  try {
    const res = await apiPost('api/chats.php', { action: 'open', user_id: userId });
    emit('open-chat', res.chat_id);
  } catch (error) {
    toast(error.message, true);
  }
}
