import { emit } from './state.js';
import { esc, avatarHtml } from './util.js';

const MAX_CARDS = 3;
const LIFETIME = 5200;
const cards = new Map();
let host = null;

function ensureHost() {
  if (host === null || host.isConnected === false) {
    host = document.createElement('div');
    host.className = 'notice-stack';
    host.id = 'notice-stack';
    document.body.appendChild(host);
  }
  return host;
}

function bodyHtml(chat, preview, count) {
  return avatarHtml({ avatar: chat.avatar, nickname: chat.title, id: chat.avatar_user }, 'avatar-sm') +
    '<span class="notice-main">' +
      '<span class="notice-title">' + esc(chat.title) + '</span>' +
      '<span class="notice-text">' + esc(preview) + '</span>' +
    '</span>' +
    (count > 1 ? '<span class="notice-count mono">' + count + '</span>' : '') +
    '<span class="notice-close" title="关闭">×</span>';
}

function drop(chatId) {
  const card = cards.get(chatId);
  if (card === undefined) {
    return;
  }
  cards.delete(chatId);
  window.clearTimeout(card.timer);
  card.node.classList.remove('is-in');
  window.setTimeout(() => {
    card.node.remove();
    if (host !== null && host.childElementCount === 0) {
      host.remove();
      host = null;
    }
  }, 180);
}

function schedule(card, chatId) {
  window.clearTimeout(card.timer);
  card.timer = window.setTimeout(() => drop(chatId), LIFETIME);
}

export function push(chat, preview) {
  const chatId = Number(chat.id);
  let card = cards.get(chatId);
  if (card === undefined) {
    const node = document.createElement('div');
    node.className = 'notice-card';
    node.innerHTML = bodyHtml(chat, preview, 1);
    ensureHost().appendChild(node);
    card = { node, timer: 0, count: 0 };
    cards.set(chatId, card);
    node.addEventListener('click', (event) => {
      if (event.target.closest('.notice-close') !== null) {
        drop(chatId);
        return;
      }
      drop(chatId);
      emit('open-chat', chatId);
    });
    node.addEventListener('mouseenter', () => window.clearTimeout(card.timer));
    node.addEventListener('mouseleave', () => schedule(card, chatId));
    window.requestAnimationFrame(() => {
      node.classList.add('is-in');
    });
  }
  card.count += 1;
  card.node.innerHTML = bodyHtml(chat, preview, card.count);
  schedule(card, chatId);
  while (cards.size > MAX_CARDS) {
    drop(Number(cards.keys().next().value));
  }
}

export function clear() {
  Array.from(cards.keys()).forEach((chatId) => {
    const card = cards.get(chatId);
    window.clearTimeout(card.timer);
    card.node.remove();
  });
  cards.clear();
  if (host !== null) {
    host.remove();
    host = null;
  }
}

export function dropChat(chatId) {
  drop(Number(chatId));
}
