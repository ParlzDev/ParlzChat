import { toast, copyText } from './util.js';
import { icon } from './icons.js';
import { openPreview } from './preview.js';

let layer = null;
let stream = null;
let rafId = 0;
let active = false;

function stop() {
  active = false;
  if (rafId !== 0) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (stream !== null) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  if (layer !== null) {
    layer.remove();
    layer = null;
  }
}

export function handleScan(text) {
  const value = String(text ?? '').trim();
  if (value === '') {
    return;
  }
  if (/^[AU]\d{1,12}$/i.test(value)) {
    openPreview('embed.php?uid=' + encodeURIComponent(value.toUpperCase()), 'Parlz');
    return;
  }
  let url = null;
  try {
    url = new URL(value);
  } catch (error) {
    url = null;
  }
  if (url !== null && (url.protocol === 'http:' || url.protocol === 'https:')) {
    if (url.origin === window.location.origin) {
      const scan = url.searchParams.get('scan');
      const uid = url.searchParams.get('uid');
      if (scan !== null && scan !== '') {
        openPreview('embed.php?scan=' + encodeURIComponent(scan), '登录确认');
        return;
      }
      if (uid !== null && uid !== '') {
        openPreview('embed.php?uid=' + encodeURIComponent(uid), 'Parlz');
        return;
      }
      openPreview(url.href, 'Parlz');
      return;
    }
    openPreview(url.href, url.host);
    return;
  }
  copyText(value);
  toast('已复制二维码内容');
}

export function decode(imageData, width, height) {
  if (typeof window.jsQR !== 'function') {
    return '';
  }
  const result = window.jsQR(imageData, width, height, { inversionAttempts: 'dontInvert' });
  return result === null || result === undefined ? '' : String(result.data ?? '');
}

export async function openScanner() {
  if (typeof window.jsQR !== 'function') {
    toast('扫码组件未加载', true);
    return;
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    toast('当前环境不支持扫码', true);
    return;
  }
  stop();
  layer = document.createElement('div');
  layer.className = 'scan-layer';
  layer.innerHTML = '<video class="scan-video" playsinline muted></video>' +
    '<span class="scan-frame"></span>' +
    '<p class="scan-tip">将二维码放入框内，自动识别</p>' +
    '<button type="button" class="scan-close" title="关闭">' + icon('close') + '</button>';
  document.body.appendChild(layer);
  layer.querySelector('.scan-close').addEventListener('click', stop);
  const video = layer.querySelector('video');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (error) {
    stop();
    toast('无法打开摄像头，请检查权限', true);
    return;
  }
  video.srcObject = stream;
  try {
    await video.play();
  } catch (error) {
    return;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  active = true;
  const tick = () => {
    if (!active) {
      return;
    }
    rafId = window.requestAnimationFrame(tick);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) {
      return;
    }
    const scale = Math.min(1, 640 / vw);
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const text = decode(frame.data, canvas.width, canvas.height);
    if (text !== '') {
      stop();
      handleScan(text);
    }
  };
  tick();
}
