import { state, emit } from './state.js';
import { $, esc, avatarHtml, toast, paintPanel, loadingHtml, uidForUser } from './util.js';
import { qrMount } from './qr.js';
import { apiGet, apiPost } from './api.js';
import * as drawer from './drawer.js';

let searchResults = null;
let groupResults = [];
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

function groupRow(group) {
  let action = '<button type="button" class="btn btn-sm btn-primary" data-act="ct-join" data-id="' + group.id + '">加入</button>';
  if (group.joined === true) {
    action = '<button type="button" class="btn btn-sm" data-act="ct-open" data-id="' + group.id + '">打开</button>';
  } else if (group.pending === true) {
    action = '<span class="pending-tag">待审批</span>';
  } else if (group.join_mode === 'verify') {
    action = '<button type="button" class="btn btn-sm btn-primary" data-act="ct-join" data-id="' + group.id + '">申请加入</button>';
  } else if (group.join_mode === 'none') {
    action = '<span class="pending-tag">不允许加入</span>';
  }
  return '<div class="row">' + avatarHtml({ id: group.id, nickname: group.name, avatar: group.avatar ?? '' }, 'avatar-sm') +
    '<span class="row-main"><span class="row-name">' + esc(group.name) + '</span>' +
    '<span class="row-sub mono">' + esc(group.uid) + ' · ' + group.members + ' 人</span></span>' +
    '<span class="row-actions">' + action + '</span></div>';
}

function renderSearch() {
  let html = '';
  if (state.searchQuery.trim() === '') {
    html = '<p class="empty-note">输入用户名 / 昵称加好友，也可以搜群名或群号</p>';
  } else if (searchResults === null) {
    html = loadingHtml('搜索中');
  } else {
    html = '<div class="list-head">用户</div>' +
      (searchResults.length === 0 ? '<p class="empty-note">没有找到这个用户</p>' : searchResults.map(searchRow).join('')) +
      '<div class="list-head">群聊</div>' +
      (groupResults.length === 0 ? '<p class="empty-note">没有搜到公开的群</p>' : groupResults.map(groupRow).join(''));
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
      '<div class="row" data-act="ct-open" data-id="' + group.id + '">' + avatarHtml({ id: group.id, nickname: group.name, avatar: group.avatar ?? '' }, 'avatar-sm') +
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
  try {
    const res = await apiGet('api/groups.php', { action: 'search', q: query });
    if (state.searchQuery.trim() !== query) {
      return;
    }
    groupResults = res.groups ?? [];
  } catch {
    groupResults = [];
  }
  if (state.view === 'contacts') {
    render();
  }
}

let faceTimer = 0;

export function openMyCode() {
  const user = state.user ?? {};
  const uid = String(user.uid ?? '');
  drawer.open('我的二维码',
    '<div class="share-card">' +
      '<div class="share-qr" id="my-qr-host"></div>' +
      '<div class="share-name">' + esc(user.nickname ?? '') + '</div>' +
      '<div class="setting-row"><span class="setting-title">我的 UID</span>' +
      '<span class="uid-row"><span class="uid mono">' + esc(uid) + '</span>' +
      '<button type="button" class="btn btn-sm" data-copy="' + esc(uid) + '">复制</button></span></div>' +
      '<p class="setting-desc">让对方用「扫一扫」对着这个码，就能直接加你好友</p>' +
    '</div>');
  qrMount($('#my-qr-host'), uid, 340);
}

export function openFaceAdd() {
  window.clearInterval(faceTimer);
  drawer.open('面对面加好友', loadingHtml());
  const draw = (code) => {
    drawer.open('面对面加好友',
      '<div class="share-card">' +
        '<p class="setting-desc">两台手机都打开 Parlz。下面这串号码给对方看，或者输入对方的号码</p>' +
        '<div class="face-code mono" id="face-mine">' + esc(code) + '</div>' +
        '<div class="form-actions drawer-actions">' +
          '<button type="button" class="btn btn-sm" id="face-refresh">换一个号码</button>' +
        '</div>' +
        '<h3 class="section-title">输入对方号码</h3>' +
        '<div class="form-actions">' +
          '<input class="input mono" id="face-input" inputmode="numeric" maxlength="4" placeholder="4 位数字">' +
          '<button type="button" class="btn btn-primary" id="face-join">加好友</button>' +
        '</div>' +
        '<p class="setting-desc" id="face-hint">对方加你之后这里会自动提示</p>' +
      '</div>');
    const input = $('#face-input');
    const join = $('#face-join');
    const refresh = $('#face-refresh');
    refresh.addEventListener('click', () => {
      openFaceAdd();
    });
    join.addEventListener('click', async () => {
      const value = String(input.value).trim();
      if (value.length !== 4) {
        toast('请输入 4 位数字', true);
        return;
      }
      join.disabled = true;
      try {
        const res = await apiPost('api/friends.php', { action: 'face-join', code: value });
        toast('已和 ' + res.user.nickname + ' 成为好友');
        window.clearInterval(faceTimer);
        await refresh();
        drawer.close();
      } catch (error) {
        toast(error.message, true);
      } finally {
        join.disabled = false;
      }
    });
    faceTimer = window.setInterval(async () => {
      if ($('#face-mine') === null) {
        window.clearInterval(faceTimer);
        return;
      }
      try {
        const res = await apiPost('api/friends.php', { action: 'face-status' });
        if (res.joined !== null && res.joined !== undefined) {
          window.clearInterval(faceTimer);
          toast('已和 ' + res.joined.nickname + ' 成为好友');
          await refresh();
          drawer.close();
        }
      } catch (error) {
        window.clearInterval(faceTimer);
      }
    }, 2500);
  };
  apiPost('api/friends.php', { action: 'face-code' })
    .then((res) => draw(String(res.code)))
    .catch((error) => {
      drawer.close();
      toast(error.message, true);
    });
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
    } else if (act === 'ct-join') {
      apiPost('api/groups.php', { action: 'join', chat_id: id })
        .then(async (res) => {
          if (res.joined === true) {
            toast('已加入群聊');
            await refreshGroups();
            emit('open-chat', Number(res.chat_id ?? id));
            return;
          }
          toast('已申请加入，等待群主/管理员同意');
          await runSearch(state.searchQuery.trim());
        })
        .catch((error) => toast(error.message, true));
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
