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

export function systemNotify(title, body) {
  if (!notifyOn() || typeof window.Notification !== 'function' || window.Notification.permission !== 'granted') {
    return;
  }
  try {
    const note = new window.Notification(title, { body, tag: 'parlz-message' });
    window.setTimeout(() => note.close(), 6000);
  } catch (error) {
    return;
  }
}
