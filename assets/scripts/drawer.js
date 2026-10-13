import { state, emit } from './state.js';
import { $, esc, avatarHtml, toast, throttle, armConfirm, fmtSize, uploadUrl, loadingHtml } from './util.js';
import { apiGet, apiPost } from './api.js';
import { parseFile, renderBody } from './richtext.js';
import { icon } from './icons.js';
import { qrMount } from './qr.js';
import * as chats from './chats.js';
import * as contacts from './contacts.js';
import * as messages from './messages.js';

let bodyNode = null;
let pendingForward = [];
let forwardMode = 'single';
let forwardPicked = new Set();
let currentGroup = null;

export function open(title, html) {
  $('#drawer-title').textContent = title;
  bodyNode.innerHTML = html;
  $('#drawer').classList.add('is-open');
}

export function close() {
  $('#drawer').classList.remove('is-open');
}

function pickList(prefix) {
  if (state.friends.length === 0) {
    return '<p class="empty-note">还没有好友，先去通讯录添加</p>';
  }
  return '<div class="check-list">' + state.friends.map((friend) =>
    '<label class="check-row"><input type="checkbox" value="' + friend.id + '" data-pick="' + prefix + '">' +
    avatarHtml(friend, 'avatar-sm', friend.online) +
    '<span class="row-main"><span class="row-name">' + esc(friend.nickname) + '</span>' +
    '<span class="row-sub mono">@' + esc(friend.username) + '</span></span></label>').join('') + '</div>';
}

function picked(prefix) {
  return Array.from(bodyNode.querySelectorAll('input[data-pick="' + prefix + '"]:checked'))
    .map((input) => Number(input.value));
}

export function openNewChat() {
  const rows = state.friends.map((friend) =>
    '<div class="row" data-act="act-dm" data-id="' + friend.id + '">' + avatarHtml(friend, 'avatar-sm', friend.online) +
    '<span class="row-main"><span class="row-name">' + esc(friend.nickname) + '</span>' +
    '<span class="row-sub mono">@' + esc(friend.username) + '</span></span>' +
    '<span class="row-actions"><button type="button" class="btn btn-sm" data-act="act-dm" data-id="' + friend.id + '">发消息</button></span></div>').join('');
  const scanHtml = window.matchMedia('(max-width: 900px)').matches
    ? '<button type="button" class="btn btn-block" data-act="act-scan">' + icon('scan') + ' 扫一扫</button>'
    : '';
  open('发起会话',
    scanHtml +
    '<button type="button" class="btn btn-block" data-act="act-group-form">' + icon('users') + ' 创建群聊</button>' +
    '<h3 class="section-title">好友私聊</h3>' +
    (rows === '' ? '<p class="empty-note">还没有好友，先搜索用户名添加</p>' : rows) +
    '<h3 class="section-title">添加好友</h3>' +
    '<button type="button" class="btn btn-block" data-act="act-add-form">' + icon('plus') + ' 搜索用户名添加</button>');
}

export function openGroupForm() {
  open('创建群聊',
    '<label class="field"><span class="field-label">群名称</span>' +
    '<input class="input" id="group-name" maxlength="30" placeholder="例如 Parlz 玩家群"></label>' +
    '<h3 class="section-title">邀请好友（可跳过）</h3>' +
    pickList('grp') +
    '<div class="form-actions drawer-actions"><button type="button" class="btn btn-primary" data-act="act-group-create">创建群聊</button></div>');
}

export function openAddFriend() {
  open('添加好友',
    '<label class="field"><span class="field-label">搜索用户</span>' +
    '<input class="input" id="friend-search" placeholder="输入用户名或昵称" autocomplete="off"></label>' +
    '<div id="friend-results"><p class="empty-note">输入关键字开始搜索</p></div>');
  const input = $('#friend-search');
  input.focus();
  const run = throttle(() => searchUsers(input.value.trim()), 320);
  input.addEventListener('input', run);
}

async function searchUsers(query) {
  const host = $('#friend-results');
  if (!host) {
    return;
  }
  if (query === '') {
    host.innerHTML = '<p class="empty-note">输入关键字开始搜索</p>';
    return;
  }
  host.innerHTML = loadingHtml('搜索中');
  try {
    const res = await apiGet('api/friends.php', { q: query });
    if (res.results.length === 0) {
      host.innerHTML = '<p class="empty-note">没有找到这个用户</p>';
      return;
    }
    host.innerHTML = res.results.map((user) => {
      let action = '<button type="button" class="btn btn-sm btn-primary" data-act="act-request" data-id="' + user.id + '">加好友</button>';
      if (user.relation === 'friend') {
        action = '<button type="button" class="btn btn-sm" data-act="act-dm" data-id="' + user.id + '">发消息</button>';
      } else if (user.relation === 'outgoing') {
        action = '<span class="pending-tag">待验证</span>';
      } else if (user.relation === 'incoming') {
        action = '<button type="button" class="btn btn-sm btn-primary" data-act="act-accept" data-id="' + user.id + '">接受</button>';
      }
      return '<div class="row">' + avatarHtml(user, 'avatar-sm', user.online) +
        '<span class="row-main"><span class="row-name">' + esc(user.nickname) + '</span>' +
        '<span class="row-sub mono">@' + esc(user.username) + '</span></span>' +
        '<span class="row-actions">' + action + '</span></div>';
    }).join('');
  } catch (error) {
    host.innerHTML = '<p class="empty-note">' + esc(error.message) + '</p>';
  }
}

export function openForwardPicker(ids) {
  pendingForward = Array.isArray(ids) ? ids.map((id) => Number(id)) : [];
  forwardMode = pendingForward.length > 1 ? 'merged' : 'single';
  forwardPicked = new Set();
  renderForwardPicker();
}

function renderForwardPicker() {
  const current = state.activeChat ? state.activeChat.id : 0;
  const rows = state.chats.map((chat) => {
    const on = forwardPicked.has(chat.id);
    return '<div class="row forward-row' + (on ? ' is-picked' : '') + '" data-act="act-forward" data-id="' + chat.id + '">' +
      avatarHtml({ id: chat.type === 'dm' ? chat.avatar_user : chat.id, nickname: chat.title, avatar: chat.avatar }, 'avatar-sm') +
      '<span class="row-main"><span class="row-name">' + esc(chat.title) +
      (chat.id === current ? '<span class="pending-tag">当前</span>' : '') + '</span>' +
      '<span class="row-sub mono">' + esc(chat.uid ?? '') + '</span></span>' +
      '<span class="row-actions">' + (on
        ? '<span class="pending-tag pick-on">已选</span>'
        : '<span class="pending-tag">' + (chat.type === 'group' ? '群聊' : '私聊') + '</span>') + '</span></div>';
  }).join('');

  const mode = '<div class="segmented forward-mode" id="forward-mode">' +
    '<button type="button" data-act="forward-mode" data-mode="merged"' + (forwardMode === 'merged' ? ' class="is-active"' : '') + '>合并转发</button>' +
    '<button type="button" data-act="forward-mode" data-mode="single"' + (forwardMode === 'single' ? ' class="is-active"' : '') + '>单独转发</button>' +
    '</div>' +
    '<p class="danger-note">' + (forwardMode === 'merged'
      ? '合并成一条聊天记录卡片，对方点开看全部内容'
      : '每条消息分别发给对方') + '</p>';

  open('转发到…', '<p class="danger-note">已选 ' + pendingForward.length + ' 条消息 · 目标 ' + forwardPicked.size + ' 个会话</p>' + mode +
    '<h3 class="section-title">选择会话（可多选）</h3>' +
    (rows === '' ? '<p class="empty-note">还没有其它会话</p>' : rows) +
    '<div class="form-actions setting-actions">' +
      '<button type="button" class="btn btn-primary" data-act="forward-go"' + (forwardPicked.size === 0 ? ' disabled' : '') + '>转发到 ' + forwardPicked.size + ' 个会话</button>' +
    '</div>');
}

async function forwardToChats(chatIds) {
  const ids = pendingForward;
  pendingForward = [];
  const mode = forwardMode;
  const targets = ids.map((id) => messages.messageById(id)).filter((message) => message !== null);
  const active = state.activeChat ? state.activeChat.id : 0;
  close();

  let mergedBody = '';
  if (mode === 'merged') {
    const items = [];
    for (const message of targets) {
      if (items.length >= 30) {
        break;
      }
      if (message.kind === 'merged') {
        items.push({
          name: message.author && message.author.nickname ? message.author.nickname : '成员',
          uid: message.author && message.author.uid ? message.author.uid : '',
          avatar: message.author && message.author.avatar ? message.author.avatar : '',
          kind: 'merged',
          body: message.body,
          at: message.created_at,
        });
        continue;
      }
      if (message.kind !== 'text' && message.kind !== 'sticker' && message.kind !== 'csticker' && message.kind !== 'image' && message.kind !== 'quote' && message.kind !== 'file') {
        continue;
      }
      items.push({
        name: message.author && message.author.nickname ? message.author.nickname : '成员',
        uid: message.author && message.author.uid ? message.author.uid : '',
        avatar: message.author && message.author.avatar ? message.author.avatar : '',
        kind: message.kind,
        body: message.body,
        at: message.created_at,
      });
    }
    if (items.length === 0) {
      messages.setSelectMode(false);
      toast('没有可合并转发的消息', true);
      return;
    }
    const title = (state.activeChat ? state.activeChat.title : '会话') + '的聊天记录';
    mergedBody = JSON.stringify({ title, items });
  }

  let okChats = 0;
  let okMessages = 0;
  for (const chatId of chatIds) {
    let count = 0;
    if (mode === 'merged') {
      try {
        const res = await apiPost('api/messages.php', { chat_id: chatId, kind: 'merged', body: mergedBody });
        count = 1;
        if (chatId === active) {
          messages.merge([res.message]);
        }
      } catch (error) {
        toast(error.message, true);
      }
    } else {
      for (const message of targets) {
        if (message.kind !== 'text' && message.kind !== 'sticker' && message.kind !== 'csticker' && message.kind !== 'image' && message.kind !== 'merged' && message.kind !== 'quote' && message.kind !== 'file') {
          continue;
        }
        try {
          const res = await apiPost('api/messages.php', { chat_id: chatId, body: message.body, kind: message.kind });
          count++;
          if (chatId === active) {
            messages.merge([res.message]);
          }
        } catch (error) {
          toast(error.message, true);
          break;
        }
      }
    }
    if (count > 0) {
      okChats++;
      okMessages += count;
    }
  }

  messages.setSelectMode(false);
  if (okChats > 0) {
    toast(chatIds.length > 1
      ? '已转发到 ' + okChats + ' 个会话'
      : (mode === 'merged' ? '已合并转发 1 条聊天记录' : '已转发 ' + okMessages + ' 条'));
    chats.refresh().catch(() => {});
  }
}

export async function openGroupInfo(chatId) {
  open('群信息', loadingHtml());
  try {
    const res = await apiGet('api/groups.php', { action: 'info', chat_id: chatId });
    renderGroupInfo(res.group);
  } catch (error) {
    toast(error.message, true);
    close();
  }
}

function renderGroupInfo(group) {
  currentGroup = group;
  const joined = new Set(group.members.map((member) => member.id));
  const invitable = state.friends.filter((friend) => !joined.has(friend.id));
  const me = state.user ?? { id: 0 };
  const friendIds = new Set(state.friends.map((friend) => friend.id));
  const outgoingIds = new Set(state.outgoing.map((user) => user.id));
  const isOwnerActor = group.is_owner || group.is_default;
  const now = Math.floor(Date.now() / 1000);
  const memberRows = group.members.map((member) => {
    let action = '';
    if (member.id !== me.id) {
      if (friendIds.has(member.id)) {
        action = '<span class="row-actions"><button type="button" class="btn btn-sm" data-act="act-dm" data-id="' + member.id + '">私聊</button></span>';
      } else if (outgoingIds.has(member.id)) {
        action = '<span class="row-actions"><span class="pending-tag">待验证</span></span>';
      } else {
        action = '<span class="row-actions"><button type="button" class="btn btn-sm btn-primary" data-act="act-request" data-id="' + member.id + '">加好友</button></span>';
      }
    }
    const role = member.id === group.owner_id ? 'owner' : (member.role === 'admin' ? 'admin' : 'member');
    const muted = Number(member.muted_until ?? 0) > now;
    return '<div class="row" data-member="' + member.id + '" data-group="' + group.id + '"' +
      ' data-role="' + role + '" data-muted-until="' + Number(member.muted_until ?? 0) + '"' +
      ' data-can-manage="' + (group.is_manager ? '1' : '0') + '" data-is-owner="' + (isOwnerActor ? '1' : '0') + '">' +
      avatarHtml(member, 'avatar-sm', member.online, true) +
      '<span class="row-main"><span class="row-name">' + esc(member.nickname) +
      (role === 'owner' ? '<span class="pending-tag">群主</span>' : '') +
      (role === 'admin' ? '<span class="pending-tag">管理员</span>' : '') +
      (muted ? '<span class="pending-tag">禁言中</span>' : '') +
      (member.id === me.id ? '<span class="pending-tag">我</span>' : '') + '</span>' +
      '<span class="row-sub mono">@' + esc(member.username) + '</span></span>' +
      action +
      '</div>';
  }).join('');

  const notice = String(group.notice ?? '').trim();
  const noticeHtml = '<h3 class="section-title">群公告</h3>' +
    (group.is_manager
      ? '<label class="field"><textarea class="input group-notice" id="group-notice" maxlength="200" rows="2" placeholder="给全群可见的公告，最多 200 字">' + esc(notice) + '</textarea></label>' +
        '<div class="form-actions drawer-actions"><button type="button" class="btn btn-sm btn-primary" data-act="act-notice" data-id="' + group.id + '">保存公告</button></div>'
      : '<p class="empty-note">' + (notice === '' ? '暂无公告' : esc(notice)) + '</p>');

  const opt = (value, label, current) =>
    '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
  const settingsHtml = group.is_manager
    ? '<h3 class="section-title">群设置</h3>' +
      '<label class="field"><span class="field-label">搜索方式</span>' +
      '<select class="input" id="group-search-mode">' +
        opt('private', '私密（别人搜不到）', group.search_mode) +
        opt('uid', '仅通过群号搜索', group.search_mode) +
        opt('keyword', '仅通过关键词搜索', group.search_mode) +
        opt('both', '关键词或群号都可以', group.search_mode) +
      '</select></label>' +
      '<label class="field"><span class="field-label">加群方式</span>' +
      '<select class="input" id="group-join-mode">' +
        opt('none', '不允许任何人加入', group.join_mode) +
        opt('verify', '需要验证身份（我来审批）', group.join_mode) +
        opt('open', '任何人都可以加入', group.join_mode) +
      '</select></label>' +
      '<div class="form-actions drawer-actions"><button type="button" class="btn btn-sm btn-primary" data-act="act-group-settings" data-id="' + group.id + '">保存设置</button></div>'
    : '';

  const nickHtml = '<h3 class="section-title">我的群名片</h3>' +
    '<div class="form-actions drawer-actions"><input class="input" id="group-nick" maxlength="16" value="' + esc(group.my_nick ?? '') + '" placeholder="在这个群里显示的名字（留空用昵称）">' +
    '<button type="button" class="btn btn-sm" data-act="act-nick" data-id="' + group.id + '">保存名片</button></div>';

  const invites = Array.isArray(group.invites) ? group.invites : [];
  const invitesHtml = invites.length > 0
    ? '<h3 class="section-title">' + (group.is_manager ? '待审批邀请 · ' + invites.length : '我的邀请申请') + '</h3>' +
      invites.map((invite) =>
        '<div class="row"><span class="row-main"><span class="row-name">' + esc(invite.invitee_name) + '</span>' +
        '<span class="row-sub">' + esc(invite.inviter_name) + ' 邀请加入</span></span>' +
        (group.is_manager
          ? '<span class="row-actions"><button type="button" class="btn btn-sm btn-primary" data-act="act-invite-ok" data-id="' + invite.id + '">同意</button>' +
            '<button type="button" class="btn btn-sm" data-act="act-invite-no" data-id="' + invite.id + '">拒绝</button></span>'
          : '<span class="row-actions"><span class="pending-tag">等待审批</span></span>') +
        '</div>').join('')
    : '';

  const files = Array.isArray(group.files) ? group.files : [];
  const filesHtml = files.length > 0
    ? '<h3 class="section-title">群文件 · ' + files.length + '</h3>' +
      files.map((entry) => {
        const date = new Date(entry.created_at * 1000);
        return '<div class="row"><span class="row-icon">' + icon('file') + '</span>' +
          '<span class="row-main"><span class="row-name">' + esc(entry.name) + '</span>' +
          '<span class="row-sub">' + esc(entry.sender) + ' · ' + fmtSize(entry.size) + ' · ' + (date.getMonth() + 1) + '/' + date.getDate() + '</span></span>' +
          '<span class="row-actions"><button type="button" class="media-dl" data-file="' + esc(entry.file) + '" data-name="' + esc(entry.name) + '" title="下载">' + icon('download') + '</button></span></div>';
      }).join('')
    : '';

  const renameHtml = group.is_owner && !group.is_default
    ? '<h3 class="section-title">群名称</h3>' +
      '<div class="form-actions"><input class="input" id="group-rename" maxlength="30" value="' + esc(group.name) + '">' +
      '<button type="button" class="btn btn-sm" data-act="act-rename" data-id="' + group.id + '">保存</button></div>'
    : '';

  const inviteHtml = invitable.length > 0
    ? '<h3 class="section-title">邀请好友</h3>' + pickList('inv') +
      '<div class="form-actions drawer-actions"><button type="button" class="btn btn-sm btn-primary" data-act="act-invite" data-id="' + group.id + '">邀请</button>' +
      (group.is_manager ? '' : '<span class="danger-note">邀请需要群主/管理员同意</span>') + '</div>'
    : '';

  const canEditAvatar = group.is_owner || group.is_default;
  const avatarHtmlBlock = '<div class="form-actions">' +
    '<button type="button" class="btn btn-sm" data-act="act-share">' + icon('share') + ' 分享群聊</button>' +
    (canEditAvatar
      ? '<button type="button" class="btn btn-sm" data-act="act-group-avatar">' + icon('image') + ' 更换群头像</button>' +
        '<input type="file" id="group-avatar-input" class="is-hidden" accept="image/png,image/jpeg,image/gif,image/webp">'
      : '') +
    '<button type="button" class="btn btn-sm" data-copy="' + esc(group.uid ?? '') + '">复制群 UID</button></div>';

  open('群信息',
    '<div class="group-head" data-group-info="' + group.id + '">' + avatarHtml({ id: group.id, nickname: group.name, avatar: group.avatar ?? '' }, 'avatar-lg') +
    '<div><div class="profile-name">' + esc(group.name) + '</div>' +
    '<div class="profile-sub mono">' + esc(group.uid ?? '') + ' · ' + group.members.length + ' 人' + (group.is_default ? ' · 默认群' : '') + '</div>' +
    avatarHtmlBlock + '</div></div>' +
    noticeHtml +
    settingsHtml +
    nickHtml +
    renameHtml +
    '<h3 class="section-title">群成员</h3>' + memberRows +
    '<p class="setting-desc">右键（长按）成员可设为管理员或禁言</p>' +
    invitesHtml +
    filesHtml +
    inviteHtml +
    (group.is_default
      ? '<p class="danger-note">Parlz 广场是默认群聊，所有成员自动加入，不能退出。</p>'
      : '<div class="form-actions drawer-actions"><button type="button" class="btn" data-act="act-leave" data-id="' + group.id + '" data-label="退出群聊">退出群聊</button></div>'));
}

function openGroupShare(group) {
  const url = window.location.origin + '/index.php?chat&uid=' + encodeURIComponent(group.uid ?? '');
  open('分享群聊',
    '<div class="share-card">' +
      '<div class="share-qr" id="share-qr-host"></div>' +
      '<div class="share-name">' + esc(group.name) + '</div>' +
      '<div class="setting-row"><span class="setting-title">群 UID</span>' +
      '<span class="uid-row"><span class="uid mono">' + esc(group.uid ?? '') + '</span>' +
      '<button type="button" class="btn btn-sm" data-copy="' + esc(group.uid ?? '') + '">复制</button></span></div>' +
      '<div class="setting-row"><span class="setting-title">链接</span>' +
      '<span class="uid-row"><span class="share-url mono">' + esc(url) + '</span>' +
      '<button type="button" class="btn btn-sm" data-copy="' + esc(url) + '">复制</button></span></div>' +
      '<p class="setting-desc">让对方用「扫一扫」扫这个码，或打开下面的链接进群</p>' +
      '<div class="form-actions"><button type="button" class="btn btn-sm" data-act="act-back-info">' + icon('back') + ' 返回群信息</button></div>' +
    '</div>');
  qrMount($('#share-qr-host'), String(group.uid ?? ''), 340);
}

export async function openFavorites() {
  open('我的收藏', loadingHtml());
  try {
    const res = await apiGet('api/favorites.php');
    const list = res.favorites ?? [];
    if (list.length === 0) {
      open('我的收藏', '<p class="empty-note">还没有收藏；右键（手机长按）消息点「收藏」即可加入</p>');
      return;
    }
    const rows = list.map((item) => {
      let body = '';
      if (item.kind === 'image' || item.kind === 'csticker') {
        body = '<img class="fav-thumb" src="' + esc(uploadUrl(item.body)) + '" alt="图片" loading="lazy">';
      } else if (item.kind === 'file' || item.kind === 'voice') {
        const data = parseFile(item.body);
        const name = data === null ? '文件' : data.name;
        body = '<span class="row-icon">' + icon('file') + '</span>' +
          '<span class="row-main"><span class="row-name">' + esc(name) + '</span>' +
          '<span class="row-sub">' + (item.kind === 'voice' ? '语音' : fmtSize(data === null ? 0 : data.size)) + '</span></span>' +
          (data === null ? '' : '<span class="row-actions"><button type="button" class="media-dl" data-file="' + esc(data.file) + '" data-name="' + esc(name) + '" title="下载">' + icon('download') + '</button></span>');
      } else {
        body = '<span class="row-main"><span class="row-name fav-text">' + renderBody(item.body) + '</span></span>';
      }
      return '<div class="row">' + body +
        '<button type="button" class="fav-del" data-act="act-fav-del" data-id="' + item.id + '" title="删除收藏">' + icon('trash') + '</button></div>';
    }).join('');
    open('我的收藏', '<p class="danger-note">共 ' + list.length + ' 条收藏</p>' + rows);
  } catch (error) {
    toast(error.message, true);
  }
}

async function openChatWith(userId) {
  try {
    const res = await apiPost('api/chats.php', { action: 'open', user_id: userId });
    close();
    await chats.refresh();
    emit('open-chat', res.chat_id);
  } catch (error) {
    toast(error.message, true);
  }
}

export async function init() {
  bodyNode = $('#drawer-body');
  $('#drawer-close').addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
    }
  });

  bodyNode.addEventListener('change', (event) => {
    if (event.target.id !== 'group-avatar-input') {
      return;
    }
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const chatId = Number(event.target.dataset.chat ?? 0);
    const form = new FormData();
    form.append('action', 'avatar');
    form.append('chat_id', String(chatId));
    form.append('avatar', file);
    import('./upload.js').then(({ uploadFile }) => uploadFile('api/groups.php', form, file.name))
      .then(async () => {
        toast('群头像已更新');
        await Promise.all([chats.refresh(), contacts.refresh()]);
        openGroupInfo(chatId);
      })
      .catch((error) => toast(error.message, true));
  });

  bodyNode.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (target === null) {
      return;
    }
    const id = Number(target.dataset.id ?? 0);
    const act = target.dataset.act;

    if (act === 'act-group-avatar') {
      const input = $('#group-avatar-input');
      if (input) {
        input.dataset.chat = String(state.activeChat ? state.activeChat.id : 0);
        input.click();
      }
    } else if (act === 'act-share') {
      if (currentGroup !== null) {
        openGroupShare(currentGroup);
      }
    } else if (act === 'act-back-info') {
      if (currentGroup !== null) {
        renderGroupInfo(currentGroup);
      }
    } else if (act === 'forward-mode') {
      forwardMode = target.dataset.mode === 'single' ? 'single' : 'merged';
      renderForwardPicker();
    } else if (act === 'act-forward') {
      if (forwardPicked.has(id)) {
        forwardPicked.delete(id);
      } else {
        forwardPicked.add(id);
      }
      renderForwardPicker();
    } else if (act === 'forward-go') {
      if (forwardPicked.size > 0) {
        forwardToChats([...forwardPicked]).catch(() => {});
      }
    } else if (act === 'act-dm') {
      openChatWith(id);
    } else if (act === 'act-group-form') {
      openGroupForm();
    } else if (act === 'act-add-form') {
      openAddFriend();
    } else if (act === 'act-scan') {
      close();
      import('./scanner.js').then(({ openScanner }) => openScanner()).catch(() => {});
    } else if (act === 'act-group-create') {
      const nameNode = $('#group-name');
      const name = nameNode ? nameNode.value.trim() : '';
      if (name === '') {
        toast('请填写群名称', true);
        return;
      }
      apiPost('api/groups.php', { action: 'create', name, member_ids: picked('grp') })
        .then(async (res) => {
          close();
          await Promise.all([chats.refresh(), contacts.refresh()]);
          emit('open-chat', res.chat_id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-request') {
      apiPost('api/friends.php', { action: 'request', user_id: id })
        .then(async (res) => {
          toast(res.accepted ? '你们已成为好友' : '好友申请已发送');
          await contacts.refresh();
          const groupNode = bodyNode.querySelector('[data-group-info]');
          if (groupNode !== null) {
            openGroupInfo(Number(groupNode.dataset.groupInfo));
          } else if ($('#friend-search')) {
            searchUsers($('#friend-search').value.trim());
          }
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-accept') {
      apiPost('api/friends.php', { action: 'accept', user_id: id })
        .then(async () => {
          toast('已添加为好友');
          await contacts.refresh();
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-invite') {
      apiPost('api/groups.php', { action: 'invite', chat_id: id, user_ids: picked('inv') })
        .then(async (res) => {
          if (res.added > 0) {
            toast('已邀请 ' + res.added + ' 位好友加入');
          } else if (res.pending > 0) {
            toast('已提交 ' + res.pending + ' 个邀请，等待群主/管理员同意');
          } else {
            toast('没有新增成员');
          }
          await Promise.all([chats.refresh(), contacts.refresh()]);
          openGroupInfo(id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-group-settings') {
      const searchNode = $('#group-search-mode');
      const joinNode = $('#group-join-mode');
      apiPost('api/groups.php', {
        action: 'settings',
        chat_id: id,
        search_mode: searchNode ? searchNode.value : 'both',
        join_mode: joinNode ? joinNode.value : 'verify',
      })
        .then(async () => {
          toast('群设置已保存');
          await openGroupInfo(id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-notice') {
      const node = $('#group-notice');
      apiPost('api/groups.php', { action: 'notice', chat_id: id, notice: node ? node.value.trim() : '' })
        .then(async () => {
          toast('群公告已更新');
          await chats.refresh();
          openGroupInfo(id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-nick') {
      const node = $('#group-nick');
      apiPost('api/groups.php', { action: 'nick', chat_id: id, nickname: node ? node.value.trim() : '' })
        .then((res) => {
          toast(res.nickname === '' ? '已恢复使用昵称' : '群名片已保存');
          openGroupInfo(id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-invite-ok' || act === 'act-invite-no') {
      apiPost('api/groups.php', { action: act === 'act-invite-ok' ? 'approve' : 'reject', chat_id: currentGroup !== null ? currentGroup.id : 0, invite_id: id })
        .then(async (res) => {
          toast(act === 'act-invite-ok' ? '已同意加入' : '已拒绝该邀请');
          if (act === 'act-invite-ok') {
            await Promise.all([chats.refresh(), contacts.refresh()]);
          }
          if (currentGroup !== null) {
            openGroupInfo(currentGroup.id);
          }
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-remark-save') {
      const node = $('#remark-input');
      apiPost('api/friends.php', { action: 'remark', user_id: id, remark: node ? node.value.trim() : '' })
        .then(async () => {
          toast('备注已保存');
          await Promise.all([chats.refresh(), contacts.refresh()]);
          close();
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-fav-del') {
      apiPost('api/favorites.php', { action: 'remove', id })
        .then(() => {
          toast('已删除收藏');
          openFavorites();
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-rename') {
      const nameNode = $('#group-rename');
      const name = nameNode ? nameNode.value.trim() : '';
      apiPost('api/groups.php', { action: 'rename', chat_id: id, name })
        .then(async () => {
          toast('群名称已更新');
          await Promise.all([chats.refresh(), contacts.refresh()]);
          openGroupInfo(id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'act-leave') {
      armConfirm(target, () => {
        apiPost('api/groups.php', { action: 'leave', chat_id: id })
          .then(async () => {
            close();
            if (state.activeChat && state.activeChat.id === id) {
              state.activeChat = null;
              chats.closePane();
            }
            await Promise.all([chats.refresh(), contacts.refresh()]);
            toast('已退出群聊');
          })
          .catch((error) => toast(error.message, true));
      });
    }
  });
}
