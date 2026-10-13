import { state, emit } from './state.js';
import { $, esc, avatarHtml, toast, paintPage, pageView, armConfirm, loadingHtml } from './util.js';
import { levelChips } from './level.js';
import { apiGet, apiPost } from './api.js';
import { icon } from './icons.js';
import * as chats from './chats.js';
import * as contacts from './contacts.js';
import * as drawer from './drawer.js';

const RELATION_LABEL = {
  self: '这是你自己',
  friend: '好友',
  incoming: '对方请求加你为好友',
  outgoing: '好友申请待验证',
  none: '还不是好友',
};

const STATUS_TEXT = {
  online: '当前在线',
  dnd: '勿扰',
  away: '离开',
  '': '当前离线',
};

function joinedText(ts) {
  if (!ts) {
    return '未知';
  }
  const date = new Date(ts * 1000);
  return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日加入';
}

function actionsFor(user) {
  if (user.relation === 'self') {
    return '<button type="button" class="btn btn-primary" data-act="pg-setting">' + icon('gear') + ' 去设置编辑资料</button>';
  }
  if (user.relation === 'friend') {
    return '<button type="button" class="btn btn-primary" data-act="pg-dm" data-id="' + user.id + '">' + icon('chat') + ' 发消息</button>' +
      '<button type="button" class="btn" data-act="pg-remark" data-id="' + user.id + '">' + icon('edit') + ' 设置备注</button>' +
      '<button type="button" class="btn" data-act="pg-remove" data-id="' + user.id + '" data-label="删除好友">删除好友</button>';
  }
  if (user.relation === 'incoming') {
    return '<button type="button" class="btn btn-primary" data-act="pg-accept" data-id="' + user.id + '">接受好友请求</button>';
  }
  if (user.relation === 'outgoing') {
    return '<span class="pending-tag">已发送申请，等待对方通过</span>';
  }
  return '<button type="button" class="btn btn-primary" data-act="pg-request" data-id="' + user.id + '">加好友</button>';
}

function draw(user) {
  paintPage('profile', '个人资料',
    '<div class="profile-card">' +
      '<div class="profile-top">' + avatarHtml(user, 'avatar-lg', user.online) +
        '<div><div class="profile-name">' + esc(user.nickname) + levelChips(user.level, true) + '</div>' +
        '<div class="profile-sub mono">@' + esc(user.username) + '</div>' +
        '<div class="uid-row"><span class="uid mono">' + esc(user.uid ?? '') + '</span>' +
        '<button type="button" class="btn btn-sm" data-copy="' + esc(user.uid ?? '') + '">复制 UID</button></div>' +
        '<div class="profile-bio">' + esc(user.bio || '还没有个性签名') + '</div>' +
        '<div class="profile-sub">' + esc(RELATION_LABEL[user.relation] ?? '') + ' · ' + esc(STATUS_TEXT[String(user.status ?? '')] ?? '当前离线') + ' · ' + joinedText(user.created_at) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-actions">' + actionsFor(user) + '</div>' +
    '</div>');
}

export async function render(userId) {
  const id = Number(userId) > 0 ? Number(userId) : (state.user ? state.user.id : 0);
  if (id === 0) {
    paintPage('profile', '个人资料', '<p class="empty-note">无法确定要查看的用户</p>');
    return;
  }
  paintPage('profile', '个人资料', loadingHtml());
  try {
    const res = await apiGet('api/users.php', { id });
    draw(res.user);
  } catch (error) {
    toast(error.message, true);
    paintPage('profile', '个人资料', '<p class="empty-note">' + esc(error.message) + '</p>');
  }
}

async function openChatWith(userId) {
  try {
    const res = await apiPost('api/chats.php', { action: 'open', user_id: userId });
    await chats.refresh();
    emit('open-chat', res.chat_id);
  } catch (error) {
    toast(error.message, true);
  }
}

export function init() {
  $('#page-view').addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (target === null || pageView() !== 'profile') {
      return;
    }
    const id = Number(target.dataset.id ?? 0);
    const act = target.dataset.act;

    if (act === 'pg-setting') {
      emit('navigate', { name: 'setting', id: 0 });
    } else if (act === 'pg-remark') {
      const friend = state.friends.find((row) => row.id === id);
      const current = friend !== undefined ? String(friend.remark ?? '') : '';
      drawer.open('设置备注',
        '<label class="field"><span class="field-label">备注名</span>' +
        '<input class="input" id="remark-input" maxlength="16" value="' + esc(current) + '" placeholder="留空则恢复显示对方昵称"></label>' +
        '<div class="form-actions drawer-actions"><button type="button" class="btn btn-primary" data-act="act-remark-save" data-id="' + id + '">保存备注</button></div>');
    } else if (act === 'pg-dm') {
      openChatWith(id);
    } else if (act === 'pg-request') {
      apiPost('api/friends.php', { action: 'request', user_id: id })
        .then(async (res) => {
          toast(res.accepted ? '你们已成为好友' : '好友申请已发送');
          await contacts.refresh();
          render(id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'pg-accept') {
      apiPost('api/friends.php', { action: 'accept', user_id: id })
        .then(async () => {
          toast('已添加为好友');
          await contacts.refresh();
          render(id);
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'pg-remove') {
      armConfirm(target, () => {
        apiPost('api/friends.php', { action: 'remove', user_id: id })
          .then(async () => {
            toast('已删除好友');
            await Promise.all([chats.refresh(), contacts.refresh()]);
            emit('navigate', { name: 'chat', id: 0 });
          })
          .catch((error) => toast(error.message, true));
      });
    }
  });
}
