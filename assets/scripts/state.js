export const state = {
  user: null,
  route: 'chat',
  view: 'chats',
  listView: 'chats',
  chats: [],
  activeChat: null,
  messages: [],
  hasMore: false,
  typingIds: [],
  onlineIds: [],
  friends: [],
  requests: [],
  outgoing: [],
  groups: [],
  chatMembers: {},
  onlineStatus: {},
  groupCalls: [],
  presence: null,
  devices: null,
  pendingUid: '',
  selectMode: false,
  selected: [],
  searchQuery: '',
  composerTyping: false,
};

const handlers = new Map();

export function on(event, handler) {
  const list = handlers.get(event) ?? [];
  list.push(handler);
  handlers.set(event, list);
}

export function emit(event, payload) {
  (handlers.get(event) ?? []).forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      console.error('Parlz 事件处理失败: ' + event, error);
    }
  });
}

export function chatById(id) {
  const target = Number(id);
  return state.chats.find((chat) => chat.id === target) ?? null;
}

export function isFriend(id) {
  const target = Number(id);
  return state.friends.some((friend) => friend.id === target);
}

export function lastMessageId() {
  if (state.messages.length === 0) {
    return 0;
  }
  return state.messages[state.messages.length - 1].id;
}

export function totalUnread() {
  return state.chats.reduce((sum, chat) => sum + (chat.unread || 0), 0);
}
