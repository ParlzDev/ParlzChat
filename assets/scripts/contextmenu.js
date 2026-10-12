import { state, emit, chatById } from './state.js';
import { esc, toast, copyText, copyImage, downloadImage, downloadFile, uidForUser, uploadUrl } from './util.js';
import { parseFile } from './richtext.js';
import { apiPost } from './api.js';
import * as messages from './messages.js';
import * as composer from './composer.js';

let menuNode = null;

function closeMenu() {
  if (menuNode !== null) {
    menuNode.remove();
    menuNode = null;
  }
}

function openMenu(items, x, y) {
  closeMenu();
  const nodes = items.filter((item) => item !== null);
  if (nodes.length === 0) {
    return;
  }
  menuNode = document.createElement('div');
  menuNode.className = 'ctx-menu';
  menuNode.innerHTML = nodes.map((item, index) => item.separator === true
    ? '<span class="ctx-sep"></span>'
    : '<button type="button" class="ctx-item" data-idx="' + index + '">' + esc(item.label) + '</button>').join('');
  document.body.appendChild(menuNode);

  const rect = menuNode.getBoundingClientRect();
  menuNode.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
  menuNode.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';

  menuNode.addEventListener('click', (event) => {
    const button = event.target.closest('[data-idx]');
    if (button === null) {
      return;
    }
    const item = nodes[Number(button.dataset.idx)];
    closeMenu();
    if (item && typeof item.run === 'function') {
      item.run();
    }
  });
}

function favorite(message) {
  if (message.kind === 'merged' || message.kind === 'quote' || message.kind === 'system' || message.kind === 'poke' || message.kind === 'call') {
    toast('这类消息暂不支持收藏', true);
    return;
  }
  const kind = message.kind === 'sticker' ? 'text' : message.kind;
  apiPost('api/favorites.php', { action: 'add', kind, body: message.body })
    .then(() => toast('已收藏'))
    .catch((error) => toast(error.message, true));
}

async function recall(message) {
  try {
    await apiPost('api/messages.php', { action: 'recall', id: message.id });
    messages.markRecalled([message.id]);
    toast('已撤回');
  } catch (error) {
    toast(error.message, true);
  }
}

function messageItems(message) {
  const chat = state.activeChat;
  const mine = state.user !== null && message.user_id === state.user.id;
  const alive = message.kind !== 'recalled';
  const items = [];

  if (message.kind === 'text' && message.body !== '') {
    items.push({ label: '复制文本', run: () => copyText(message.body) });
  }
  if (message.kind === 'image') {
    items.push({ label: '复制图片', run: () => copyImage(uploadUrl(message.body)) });
    items.push({ label: '保存图片', run: () => downloadImage(uploadUrl(message.body), message.body) });
    items.push({ label: '在新窗口打开图片', run: () => window.open(uploadUrl(message.body), '_blank', 'noopener') });
    items.push({ label: '复制图片链接', run: () => copyText(new URL(uploadUrl(message.body), window.location.href).href) });
  }
  if (message.kind === 'file') {
    const file = parseFile(message.body);
    if (file !== null) {
      items.push({ label: '下载文件', run: () => downloadFile(uploadUrl(file.file), file.name) });
      items.push({ label: '复制文件链接', run: () => copyText(new URL(uploadUrl(file.file), window.location.href).href) });
    }
  }
  if (alive && !mine && chat !== null && chat.type === 'group') {
    items.push({ separator: true });
    items.push({ label: '@' + message.author.nickname, run: () => composer.insertMention(message.author.nickname) });
  }
  if (alive) {
    items.push({ separator: true });
    items.push({ label: '收藏', run: () => favorite(message) });
    items.push({ label: '引用', run: () => composer.startQuote(message) });
    items.push({ label: '转发', run: () => emit('forward', [message.id]) });
    items.push({ label: '多选', run: () => messages.setSelectMode(true) });
  }
  if (alive && mine) {
    items.push({ separator: true });
    items.push({ label: '撤回这条消息', run: () => recall(message) });
  }
  return items;
}

function setChatBg(chat, file) {
  apiPost('api/chats.php', { action: 'bg', chat_id: chat.id, file })
    .then(async () => {
      const chats = await import('./chats.js');
      await chats.refresh();
      toast(file === '' ? '已恢复默认背景' : '聊天背景已更新');
    })
    .catch((error) => toast(error.message, true));
}

function pickChatBg(chat) {
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
      const { uploadFile } = await import('./upload.js');
      const res = await uploadFile('api/uploads.php', form, file.name);
      setChatBg(chat, res.file);
    } catch (error) {
      toast(error.message, true);
    }
  });
  input.click();
}

function chatItems(chat) {
  const items = [{ label: '打开会话', run: () => emit('open-chat', chat.id) }];
  items.push({
    label: chat.pinned ? '取消置顶' : '置顶会话',
    run: () => {
      apiPost('api/chats.php', { action: 'pin', chat_id: chat.id })
        .then(async () => {
          const chats = await import('./chats.js');
          await chats.refresh();
          toast(chat.pinned ? '已取消置顶' : '已置顶到最前');
        })
        .catch((error) => toast(error.message, true));
    },
  });
  items.push({
    label: chat.muted ? '开启消息提醒' : '消息免打扰',
    run: () => {
      apiPost('api/chats.php', { action: 'mute', chat_id: chat.id })
        .then(async () => {
          const chats = await import('./chats.js');
          await chats.refresh();
          toast(chat.muted ? '已开启消息提醒' : '已开启免打扰，只显示小红点');
        })
        .catch((error) => toast(error.message, true));
    },
  });
  items.push({ separator: true });
  items.push({ label: chat.bg ? '更换聊天背景' : '设置聊天背景', run: () => pickChatBg(chat) });
  if (chat.bg) {
    items.push({ label: '恢复默认背景', run: () => setChatBg(chat, '') });
  }
  if (chat.uid) {
    items.push({ label: '复制 ' + chat.uid, run: () => copyText(chat.uid) });
  }
  if (chat.type === 'group') {
    items.push({ label: '群信息', run: () => emit('group-info', chat.id) });
  }
  return items;
}

function memberItems(node) {
  const items = [];
  const chatId = Number(node.dataset.group ?? 0);
  const userId = Number(node.dataset.member ?? 0);
  const role = node.dataset.role ?? 'member';
  const canManage = node.dataset.canManage === '1';
  const isOwnerActor = node.dataset.isOwner === '1';
  const mutedUntil = Number(node.dataset.mutedUntil ?? 0);
  if (!canManage || chatId <= 0 || userId <= 0) {
    return items;
  }
  if (isOwnerActor && role !== 'owner') {
    items.push({
      label: role === 'admin' ? '取消管理员' : '设为管理员',
      run: () => {
        apiPost('api/groups.php', { action: 'admin', chat_id: chatId, user_id: userId })
          .then((res) => {
            toast(res.role === 'admin' ? '已设为管理员' : '已取消管理员');
            emit('group-info', chatId);
          })
          .catch((error) => toast(error.message, true));
      },
    });
  }
  if (role !== 'owner') {
    const muted = mutedUntil * 1000 > Date.now();
    if (muted) {
      items.push({
        label: '解除禁言',
        run: () => {
          apiPost('api/groups.php', { action: 'mute', chat_id: chatId, user_id: userId, minutes: 0 })
            .then(() => {
              toast('已解除禁言');
              emit('group-info', chatId);
            })
            .catch((error) => toast(error.message, true));
        },
      });
    } else {
      if (items.length > 0) {
        items.push({ separator: true });
      }
      [[10, '禁言 10 分钟'], [60, '禁言 1 小时'], [1440, '禁言 1 天']].forEach((entry) => {
        items.push({
          label: entry[1],
          run: () => {
            apiPost('api/groups.php', { action: 'mute', chat_id: chatId, user_id: userId, minutes: entry[0] })
              .then(() => {
                toast('已禁言 ' + entry[1].replace('禁言 ', ''));
                emit('group-info', chatId);
              })
              .catch((error) => toast(error.message, true));
          },
        });
      });
    }
  }
  return items;
}

let menuStamp = 0;
let swallowClick = false;

function itemsFor(target) {
  const selection = window.getSelection();
  if (selection !== null && String(selection).length > 0) {
    return null;
  }

  let items = null;
  const msgNode = target.closest('[data-msg]');
  if (msgNode !== null) {
    const message = messages.messageById(Number(msgNode.dataset.msg));
    if (message !== null) {
      items = messageItems(message);
    }
  }

  const convNode = target.closest('[data-chat]');
  if (items === null && convNode !== null) {
    const chat = chatById(Number(convNode.dataset.chat));
    if (chat !== null) {
      items = chatItems(chat);
    }
  }

  const memberNode = target.closest('[data-member]');
  if (items === null && memberNode !== null) {
    const built = memberItems(memberNode);
    if (built.length > 0) {
      items = built;
    }
  }

  const avatarNode = target.closest('[data-user]');
  if (items === null && avatarNode !== null) {
    const id = Number(avatarNode.dataset.user);
    const avatarImg = avatarNode.querySelector('img');
    if (id > 0) {
      items = [];
      if (avatarImg !== null) {
        items.push({ label: '复制图片', run: () => copyImage(avatarImg.getAttribute('src') ?? '') });
      }
      items.push({ label: '复制 ' + uidForUser(id), run: () => copyText(uidForUser(id)) });
    }
  }

  return items === null || items.length === 0 ? null : items;
}

function showMenu(target, x, y) {
  const items = itemsFor(target);
  if (items === null) {
    return false;
  }
  menuStamp = Date.now();
  openMenu(items, x, y);
  return true;
}

export function init() {
  document.addEventListener('contextmenu', (event) => {
    if (Date.now() - menuStamp < 700) {
      event.preventDefault();
      return;
    }
    if (showMenu(event.target, event.clientX, event.clientY)) {
      event.preventDefault();
    }
  });

  let pressTimer = null;
  let pressX = 0;
  let pressY = 0;
  let pressTarget = null;

  const cancelPress = () => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressTarget = null;
  };

  document.addEventListener('touchstart', (event) => {
    cancelPress();
    if (event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    pressX = touch.clientX;
    pressY = touch.clientY;
    pressTarget = event.target;
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      const target = pressTarget;
      pressTarget = null;
      if (target === null || !showMenu(target, pressX, pressY)) {
        return;
      }
      swallowClick = true;
      window.setTimeout(() => { swallowClick = false; }, 800);
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    }, 450);
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (pressTimer === null) {
      return;
    }
    const touch = event.touches[0];
    if (touch === undefined) {
      return;
    }
    if (Math.abs(touch.clientX - pressX) > 10 || Math.abs(touch.clientY - pressY) > 10) {
      cancelPress();
    }
  }, { passive: true });

  document.addEventListener('touchend', cancelPress, { passive: true });
  document.addEventListener('touchcancel', cancelPress, { passive: true });

  document.addEventListener('click', (event) => {
    if (swallowClick) {
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
}
