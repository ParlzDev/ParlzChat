import { state, on, totalUnread } from './state.js';
import { $, esc, initials, skinFor, avatarUrl, toast, copyText, copyImage, uidName, uidUserId, slideIn } from './util.js';
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
import * as preview from './preview.js';
import * as search from './search.js';
import * as scan from './scan.js';
import * as calls from './call.js';
import * as gcall from './gcall.js';
import * as pz from './pz.js';
import * as poller from './poller.js';

const PANEL_TITLES = { chats: '聊天', contacts: '通讯录' };
const PANEL_PLACEHOLDERS = { chats: '搜索会话', contacts: '搜索用户名或昵称，加为好友' };
const RAIL_FOR = { chats: 'chat', contacts: 'contact' };

function renderRailAvatar() {
  const node = $('#rail-avatar');
  const user = state.user ?? {};
  const name = user.nickname ?? '我';
  node.dataset.skin = String(skinFor(user.id));
  const face = user.avatar
    ? '<img src="' + avatarUrl(user.avatar) + '" alt="">'
    : '<span>' + esc(initials(name)) + '</span>';
  node.innerHTML = '<span class="rail-face">' + face + '<span class="avatar-on"></span></span>' +
    '<span class="rail-label">我</span>';
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

function railItems() {
  return Array.from(document.querySelectorAll('.rail .rail-tab, .rail .rail-avatar'));
}

function moveRailPill(animate = true) {
  const rail = document.querySelector('.rail');
  const pill = $('#rail-pill');
  if (rail === null || pill === null) {
    return;
  }
  const active = rail.querySelector('.rail-tab.is-active') ?? rail.querySelector('.rail-avatar.is-active');
  if (active === null) {
    pill.classList.add('is-hidden');
    return;
  }
  const railBox = rail.getBoundingClientRect();
  const box = active.getBoundingClientRect();
  const size = 34;
  pill.classList.remove('is-hidden');
  pill.classList.toggle('is-dragging', !animate);
  pill.style.transform = 'translateX(' + Math.round(box.left - railBox.left + box.width / 2 - size / 2) + 'px)';
}

function railPillFollow(clientX) {
  const rail = document.querySelector('.rail');
  const pill = $('#rail-pill');
  if (rail === null || pill === null) {
    return;
  }
  const railBox = rail.getBoundingClientRect();
  const size = 34;
  const left = Math.min(Math.max(clientX - railBox.left - size / 2, 6), railBox.width - size - 6);
  pill.classList.add('is-dragging');
  pill.style.transform = 'translateX(' + Math.round(left) + 'px)';
}

function railItemAt(clientX, clientY) {
  const items = railItems();
  let best = null;
  let bestGap = Infinity;
  items.forEach((item) => {
    const box = item.getBoundingClientRect();
    const gap = Math.abs(clientX - (box.left + box.width / 2));
    if (box.height > 0 && gap < bestGap) {
      best = item;
      bestGap = gap;
    }
  });
  if (best === null) {
    return null;
  }
  const box = best.getBoundingClientRect();
  return clientY >= box.top - 12 && clientY <= box.bottom + 12 ? best : null;
}

function railActive(rail) {
  document.querySelectorAll('.rail-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === rail);
  });
  $('#rail-avatar').classList.toggle('is-active', rail === 'profile');
  moveRailPill();
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
  $('#panel-actions').innerHTML = '<button type="button" class="icon-btn" id="panel-add" title="更多">' + icon('plus') + '</button>';
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

function slideRoute() {
  const host = state.route === 'contact' || state.route === 'chat'
    ? (state.route === 'chat' ? $('#chat') : $('#panel-body'))
    : $('#page-view');
  if (host === null || host.classList.contains('is-hidden')) {
    return;
  }
  slideIn(host);
}

export function applyRoute(route) {
  paintRoute(route);
  slideRoute();
}

function paintRoute(route) {
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
  window.requestAnimationFrame(() => moveRailPill(false));
  pz.consumePz();
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

function closeAddMenu() {
  const node = $('#panel-add-menu');
  if (node !== null) {
    node.remove();
  }
}

function openAddMenu(anchor) {
  closeAddMenu();
  const node = document.createElement('div');
  node.className = 'ctx-menu add-menu';
  node.id = 'panel-add-menu';
  const contactsView = state.view === 'contacts';
  node.innerHTML = contactsView
    ? '<button type="button" class="ctx-item" data-add="mycode">' + icon('qr') + '<span>我的二维码</span></button>' +
      '<button type="button" class="ctx-item" data-add="scan">' + icon('scan') + '<span>扫码加好友</span></button>' +
      '<button type="button" class="ctx-item" data-add="face">' + icon('hand') + '<span>面对面加好友</span></button>'
    : '<button type="button" class="ctx-item" data-add="scan">' + icon('scan') + '<span>扫一扫</span></button>' +
      '<button type="button" class="ctx-item" data-add="group">' + icon('users') + '<span>创建群聊</span></button>';
  document.body.appendChild(node);
  const box = anchor.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  node.style.top = Math.round(box.bottom + 6) + 'px';
  node.style.left = Math.round(Math.max(8, Math.min(box.right - rect.width, window.innerWidth - rect.width - 8))) + 'px';
}

function wire() {
  wireNativeGesture();

  document.querySelectorAll('.rail-tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.view, 0));
  });

  $('#rail-avatar').addEventListener('click', () => navigate('profile', 0));

  const rail = document.querySelector('.rail');
  let railDrag = null;

  rail.addEventListener('pointerdown', (event) => {
    if (!window.matchMedia('(max-width: 900px)').matches || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    railDrag = { id: event.pointerId, startX: event.clientX, moved: false };
  });

  rail.addEventListener('pointermove', (event) => {
    if (railDrag === null || event.pointerId !== railDrag.id) {
      return;
    }
    if (!railDrag.moved && Math.abs(event.clientX - railDrag.startX) < 6) {
      return;
    }
    railDrag.moved = true;
    railPillFollow(event.clientX);
  });

  const endRailDrag = (event) => {
    if (railDrag === null || event.pointerId !== railDrag.id) {
      return;
    }
    const moved = railDrag.moved;
    railDrag = null;
    if (!moved) {
      moveRailPill();
      return;
    }
    const item = railItemAt(event.clientX, event.clientY);
    if (item === null) {
      moveRailPill();
      return;
    }
    if (item.classList.contains('rail-avatar')) {
      navigate('profile', 0);
      return;
    }
    navigate(item.dataset.view ?? 'chat', 0);
  };

  rail.addEventListener('pointerup', endRailDrag);
  rail.addEventListener('pointercancel', endRailDrag);

  window.addEventListener('resize', () => moveRailPill(false));
  window.addEventListener('orientationchange', () => window.setTimeout(() => moveRailPill(false), 120));

  $('#logout-btn').addEventListener('click', () => {
    gcall.hangUp();
    auth.logout();
  });

  $('#panel-actions').addEventListener('click', (event) => {
    const addButton = event.target.closest('#panel-add');
    if (addButton === null) {
      return;
    }
    if ($('#panel-add-menu') === null) {
      openAddMenu(addButton);
    } else {
      closeAddMenu();
    }
  });

  document.addEventListener('click', (event) => {
    const addItem = event.target.closest('[data-add]');
    if (addItem !== null) {
      closeAddMenu();
      const add = addItem.dataset.add;
      if (add === 'scan') {
        import('./scanner.js').then(({ openScanner }) => openScanner()).catch(() => {});
        return;
      }
      if (add === 'mycode') {
        contacts.openMyCode();
        return;
      }
      if (add === 'face') {
        contacts.openFaceAdd();
        return;
      }
      drawer.openGroupForm();
      return;
    }
    if (event.target.closest('#panel-add') === null && event.target.closest('#panel-add-menu') === null) {
      closeAddMenu();
    }
  });
  window.addEventListener('scroll', closeAddMenu, { capture: true, passive: true });

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
      closeAddMenu();
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

  const safeInit = (name, run) => {
    try {
      run();
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error('Parlz init failed: ' + name, error);
      }
    }
  };

  safeInit('chats', () => chats.init());
  safeInit('messages', () => messages.init());
  safeInit('contacts', () => contacts.init());
  safeInit('profile', () => profile.init());
  safeInit('settings', () => settings.init());
  safeInit('composer', () => composer.init());
  safeInit('drawer', () => drawer.init());
  safeInit('contextmenu', () => contextmenu.init());
  safeInit('preview', () => preview.init());
  safeInit('search', () => search.init());
  safeInit('scan', () => scan.init());
  safeInit('calls', () => calls.init());
  safeInit('gcall', () => gcall.init());
  safeInit('pz', () => pz.installPzBridge());
  auth.initAuth(startSession, (tab) => navigate(tab, 0, { replace: true }));
}

const boot = window.PARLZ_BOOT ?? {};

wire();

if (boot.user) {
  startSession(boot.user, boot.route ?? { name: 'chat', id: 0 });
} else {
  pz.stashPz();
  auth.showAuth(boot.route && boot.route.name === 'register' ? 'register' : 'login');
}
