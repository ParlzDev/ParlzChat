const SOUND_KEY = 'parlz-sound';
const NOTIFY_KEY = 'parlz-notify';
let audioCtx = null;

function flag(key, onDefault) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? onDefault : value !== '0';
  } catch (error) {
    return onDefault;
  }
}

export function soundOn() {
  return flag(SOUND_KEY, true);
}

export function notifyOn() {
  return flag(NOTIFY_KEY, true);
}

export function setSound(on) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch (error) {
    return;
  }
}

export function setNotify(on) {
  try {
    window.localStorage.setItem(NOTIFY_KEY, on ? '1' : '0');
  } catch (error) {
    return;
  }
}

export function requestNotifyPermission() {
  if (typeof window.Notification !== 'function') {
    return Promise.resolve('unsupported');
  }
  if (window.Notification.permission === 'granted') {
    return Promise.resolve('granted');
  }
  return window.Notification.requestPermission();
}

export function ping() {
  if (!soundOn()) {
    return;
  }
  try {
    if (audioCtx === null) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (typeof Ctor !== 'function') {
        return;
      }
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const now = audioCtx.currentTime;
    [880, 1174].forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.08, now + index * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.2);
    });
  } catch (error) {
    return;
  }
}

function nativeChannel() {
  if (typeof window.ParlzAndroid?.notify === 'function') {
    return 'android';
  }
  if (typeof window.ParlzLinux?.notify === 'function') {
    return 'linux';
  }
  if (typeof window.chrome?.webview?.postMessage === 'function') {
    return 'windows';
  }
  if (typeof window.webkit?.messageHandlers?.parlz?.postMessage === 'function') {
    return 'apple';
  }
  return 'web';
}

export function notifyTarget() {
  return nativeChannel();
}

export function systemNotify(title, body, count = 0, extra = null) {
  if (!notifyOn()) {
    return;
  }
  const text = String(body ?? '');
  const head = String(title ?? 'Parlz');
  const channel = nativeChannel();
  try {
    if (channel === 'android') {
      window.ParlzAndroid.notify(head, text, Math.max(0, count | 0));
      return;
    }
    if (channel === 'linux') {
      window.ParlzLinux.notify(head, text, Math.max(0, count | 0));
      return;
    }
    if (channel === 'windows') {
      const payload = { cmd: 'notify', title: head, body: text, count: Math.max(0, count | 0) };
      if (extra !== null && Number(extra.chatId) > 0) {
        payload.chat_id = Number(extra.chatId);
      }
      if (extra !== null && typeof extra.avatar === 'string' && extra.avatar !== '') {
        payload.avatar = extra.avatar;
      }
      window.chrome.webview.postMessage(payload);
      return;
    }
    if (channel === 'apple') {
      const payload = { cmd: 'notify', title: head, body: text, count: Math.max(0, count | 0) };
      if (extra !== null && Number(extra.chatId) > 0) {
        payload.chat_id = Number(extra.chatId);
      }
      if (extra !== null && typeof extra.avatar === 'string' && extra.avatar !== '') {
        payload.avatar = extra.avatar;
      }
      window.webkit.messageHandlers.parlz.postMessage(payload);
      return;
    }
  } catch (error) {
    return;
  }
  if (typeof window.Notification !== 'function' || window.Notification.permission !== 'granted') {
    return;
  }
  try {
    const note = new window.Notification(head, { body: text, tag: 'parlz-message' });
    window.setTimeout(() => note.close(), 6000);
  } catch (error) {
    return;
  }
}
