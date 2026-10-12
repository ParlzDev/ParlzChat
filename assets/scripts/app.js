import { state, on, totalUnread } from './state.js';
import { $, esc, initials, skinFor, avatarUrl, toast, copyText, copyImage, uidName, uidUserId } from './util.js';
import { apiPost } from './api.js';
import { icon } from './icons.js';
import * as router from './router.js';
import * as auth from './auth.js';
import * as chats from './chats.js';
import * as contacts from './contacts.js';
import * as messages from './messages.js';
import * as profile from './profile.js';
import * as moments from './moments.js';
import * as settings from './settings.js';
import * as composer from './composer.js';
import * as drawer from './drawer.js';
import * as contextmenu from './contextmenu.js';
import * as scan from './scan.js';
import * as calls from './call.js';
import * as poller from './poller.js';

const PANEL_TITLES = { chats: '聊天', contacts: '通讯录' };
const PANEL_PLACEHOLDERS = { chats: '搜索会话', contacts: '搜索用户名或昵称，加为好友' };
const RAIL_FOR = { chats: 'chat', contacts: 'contact' };

function renderRailAvatar() {
  const node = $('#rail-avatar');
  const user = state.user ?? {};
  const name = user.nickname ?? '我';
  node.dataset.skin = String(skinFor(user.id));
  node.innerHTML = (user.avatar
    ? '<img src="' + avatarUrl(user.avatar) + '" alt="">'
    : '<span>' + esc(initials(name)) + '</span>') + '<span class="avatar-on"></span>';
  node.title = name + ' 的资料';
}

function refreshBadges() {
  const unread = totalUnread();
  const chatBadge = $('#badge-chats');
  chatBadge.classList.toggle('is-hidden', unread === 0);
  chatBadge.textContent = unread > 99 ? '99+' : String(unread);
  const requestBadge = $('#badge-contacts');
  requestBadge.classList.toggle('is-hidden', state.requests.length === 0);
  requestBadge.textContent = String(state.requests.length);
}

function railActive(rail) {
  document.querySelectorAll('.rail-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === rail);
  });
  $('#rail-avatar').classList.toggle('is-active', rail === 'profile');
}

function showPanel(target) {
  const listView = target === 'contacts' ? 'contacts' : 'chats';
  state.listView = listView;
  state.view = listView;
  state.searchQuery = '';
  $('#panel-search').value = '';
  $('#panel-title').textContent = PANEL_TITLES[listView];
  $('#panel-search-wrap').classList.remove('is-hidden');
  $('#panel-search').placeholder = PANEL_PLACEHOLDERS[listView];
  $('#panel-actions').innerHTML = '<button type="button" class="icon-btn" id="panel-add" title="' +
    (listView === 'chats' ? '发起会话' : '添加好友') + '">' + icon('plus') + '</button>';
  if (listView === 'chats') {
    chats.render();
  } else {
    contacts.render();
    if (state.groups.length === 0) {
      contacts.refreshGroups().catch(() => {});
    }
  }
}

function showMain(mode) {
  const isPage = mode === 'page';
  $('#chat-view').classList.toggle('is-hidden', isPage);
  $('#page-view').classList.toggle('is-hidden', !isPage);
  const layer = $('#chat');
  if (isPage) {
    layer.classList.add('is-open');
  } else if (window.matchMedia('(max-width: 900px)').matches) {
    layer.classList.remove('is-open');
    $('#app').classList.remove('chat-open');
  }
}

async function openByUid(rawUid) {
  const uid = uidName(rawUid);
  if (uid === '') {
    return;
  }
  const found = state.chats.find((chat) => uidName(chat.uid) === uid);
  if (found) {
    chats.open(found.id);
    return;
  }
  const userId = uidUserId(uid);
  if (userId === 0) {
    toast('没有找到 UID ' + uid + ' 对应的会话', true);
    return;
  }
  try {
    const res = await apiPost('api/chats.php', { action: 'open', user_id: userId });
    await chats.refresh();
    chats.open(res.chat_id);
  } catch (error) {
    toast(error.message, true);
  }
}

async function flushPendingUid(force) {
  const uid = state.pendingUid;
  if (!uid || (!force && state.chats.length === 0)) {
    return;
  }
  state.pendingUid = '';
  await openByUid(uid);
}

export function applyRoute(route) {
  const name = route.name;
  state.route = name;
  if (name !== 'chat') {
    state.pendingUid = '';
  }

  if (name === 'login' || name === 'register') {
    drawer.close();
    auth.showAuth(name);
    return;
  }
  if (state.user === null) {
    auth.showAuth('login');
    return;
  }

  auth.showApp();

  if (name === 'profile') {
    showPanel(state.listView);
    railActive('profile');
    showMain('page');
    drawer.close();
    profile.render(route.id);
    return;
  }

  if (name === 'setting') {
    showPanel(state.listView);
    railActive('setting');
    showMain('page');
    drawer.close();
    settings.render();
    return;
  }

  if (name === 'moments') {
    showPanel(state.listView);
    railActive('moments');
    showMain('page');
    drawer.close();
    moments.render();
    return;
  }

  if (name === 'scan') {
    showPanel(state.listView);
    showMain('page');
    drawer.close();
    scan.render(route.scan ?? '');
    return;
  }

  const listView = name === 'contact' ? 'contacts' : 'chats';
  showPanel(listView);
  railActive(RAIL_FOR[listView]);
  showMain('chat');
  drawer.close();
  if (listView === 'chats') {
    if (state.activeChat) {
      chats.showPane(!window.matchMedia('(max-width: 900px)').matches);
    }
    if (route.uid) {
      state.pendingUid = route.uid;
      flushPendingUid(false).catch(() => {});
    }
  } else {
    chats.closePane();
  }
}

export function navigate(name, id = 0, options = {}) {
  if (options.replace) {
    router.replace(name, id);
  } else {
    router.push(name, id);
  }
  applyRoute({ name, id });
}

function goBack() {
  if (router.hasAppHistory()) {
    window.history.back();
  } else {
    navigate(state.listView, 0, { replace: true });
  }
}

function openLightbox(src) {
  const box = $('#lightbox');
  const img = $('#lightbox-img');
  const link = $('#lightbox-open');
  if (box === null || img === null || !src) {
    return;
  }
  img.setAttribute('src', src);
  if (link !== null) {
    link.setAttribute('href', src);
  }
  box.classList.remove('is-hidden');
}

function closeLightbox() {
  const box = $('#lightbox');
  const img = $('#lightbox-img');
  if (box === null || img === null || box.classList.contains('is-hidden')) {
    return;
  }
  box.classList.add('is-hidden');
  img.removeAttribute('src');
}

export async function startSession(user, route) {
  state.user = user;
  auth.showApp();
  renderRailAvatar();
  refreshBadges();
  const target = route ?? router.current();
  if (target.name === 'login' || target.name === 'register') {
    router.replace('chat', 0);
    target.name = 'chat';
  }
  applyRoute(target);
  try {
    await chats.refresh();
  } catch (error) {
    toast(error.message, true);
  }
  await flushPendingUid(true);
  contacts.refresh()
    .then(() => contacts.refreshGroups())
    .catch(() => {});
  poller.start();
}

function wireNativeGesture() {
  const bridge = window.ParlzAndroid ?? window.ParlzIOS ?? window.ParlzLinux;
  if (!bridge || typeof bridge.openServerDialog !== 'function') {
    return;
  }
  let timer = null;
  let startX = 0;
  let startY = 0;
  const clear = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  document.addEventListener('touchstart', (event) => {
    clear();
    if (event.touches.length === 2) {
      startX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      startY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      timer = window.setTimeout(() => {
        timer = null;
        bridge.openServerDialog();
      }, 700);
    }
  }, { passive: true });
  document.addEventListener('touchend', clear, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length < 2) {
      clear();
      return;
    }
    const x = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    if (Math.abs(x - startX) > 12 || Math.abs(y - startY) > 12) {
      clear();
    }
  }, { passive: true });
}

function wire() {
  wireNativeGesture();

  document.querySelectorAll('.rail-tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.view, 0));
  });

  $('#rail-avatar').addEventListener('click', () => navigate('profile', 0));

  $('#logout-btn').addEventListener('click', () => auth.logout());

  $('#panel-actions').addEventListener('click', (event) => {
    if (event.target.closest('#panel-add') === null) {
      return;
    }
    if (state.view === 'contacts') {
      drawer.openAddFriend();
    } else {
      drawer.openNewChat();
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#lightbox-copy') !== null) {
      const source = $('#lightbox-img');
      if (source !== null) {
        copyImage(source.getAttribute('src') ?? '');
      }
      return;
    }
    if (event.target.closest('#lightbox-close') !== null) {
      closeLightbox();
      return;
    }
    if (event.target.closest('#lightbox') !== null) {
      if (event.target.closest('.modal-card') === null) {
        closeLightbox();
      }
      return;
    }
    const image = event.target.closest('.image-bubble img, .merged-thumb, .post-img');
    if (image !== null) {
      openLightbox(image.getAttribute('src'));
      return;
    }
    if (event.target.closest('[data-back]') !== null) {
      goBack();
      return;
    }
    const copyNode = event.target.closest('[data-copy]');
    if (copyNode !== null) {
      copyText(copyNode.dataset.copy ?? '');
      return;
    }
    const node = event.target.closest('[data-user]');
    if (node !== null) {
      navigate('profile', Number(node.dataset.user));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeLightbox();
    }
  });

  window.addEventListener('popstate', () => applyRoute(router.current()));

  on('chats', () => {
    refreshBadges();
    if (state.view === 'chats') {
      chats.render();
    }
  });

  on('contacts', () => {
    refreshBadges();
    if (state.view === 'contacts') {
      contacts.render();
    }
  });

  on('profile', () => {
    renderRailAvatar();
    if (state.route === 'setting') {
      settings.render();
    }
  });

  on('navigate', (route) => navigate(route.name, route.id ?? 0));

  on('group-info', (chatId) => drawer.openGroupInfo(chatId));

  on('forward', (ids) => drawer.openForwardPicker(ids));

  on('open-chat', (chatId) => {
    if (state.route !== 'chat') {
      navigate('chat', 0);
    }
    chats.open(chatId);
  });

  chats.init();
  messages.init();
  contacts.init();
  profile.init();
  settings.init();
  composer.init();
  drawer.init();
  contextmenu.init();
  scan.init();
  calls.init();
  auth.initAuth(startSession, (tab) => navigate(tab, 0, { replace: true }));
}

const boot = window.PARLZ_BOOT ?? {};

wire();

if (boot.user) {
  startSession(boot.user, boot.route ?? { name: 'chat', id: 0 });
} else {
  auth.showAuth(boot.route && boot.route.name === 'register' ? 'register' : 'login');
}
