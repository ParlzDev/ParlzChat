const ROUTES = ['chat', 'contact', 'moments', 'setting', 'profile', 'login', 'register', 'scan'];

export function urlFor(name, id, uid) {
  const route = ROUTES.includes(name) ? name : 'chat';
  const suffix = uid ? '&uid=' + encodeURIComponent(String(uid)) : '';
  if (route === 'profile' && Number(id) > 0) {
    return 'index.php?profile&id=' + Number(id);
  }
  return 'index.php?' + route + suffix;
}

export function parse(search) {
  const params = new URLSearchParams(search ?? window.location.search);
  for (const name of ROUTES) {
    if (params.has(name)) {
      return {
        name,
        id: Number(params.get('id') ?? 0),
        uid: String(params.get('uid') ?? ''),
        scan: name === 'scan' ? String(params.get('scan') ?? '') : '',
      };
    }
  }
  return { name: 'chat', id: 0, uid: '', scan: '' };
}

export function current() {
  return parse(window.location.search);
}

export function push(name, id, uid) {
  window.history.pushState({ parlz: true, name, id }, '', urlFor(name, id, uid));
}

export function replace(name, id, uid) {
  window.history.replaceState({ parlz: true, name, id }, '', urlFor(name, id, uid));
}

export function hasAppHistory() {
  return window.history.state !== null && window.history.state.parlz === true;
}
