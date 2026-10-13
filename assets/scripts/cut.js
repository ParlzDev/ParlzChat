import { $, esc, toast, downloadFile } from './util.js';
import { icon } from './icons.js';

const TOOLS = ['move', 'rect', 'ellipse', 'arrow', 'pen', 'text', 'mosaic'];
const COLORS = ['#ff3b30', '#00d95f', '#2f7bff', '#ffd400', '#0b2415'];
const HANDLE = 9;

const TOOL_ICONS = {
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l3.4 3.4h-2v5h5v-2l3.4 3-3.4 3v-2h-5v5h2l-3.4 3.4L8.6 18h2v-5h-5v2L2.2 12 5.6 9v2h5V6h-2z"/></svg>',
  rect: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  ellipse: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L17.5 6.5M17.5 6.5h-5.6M17.5 6.5v5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.2V20h2.8l9.9-9.9-2.8-2.8zM18.7 7.3a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 0 0-1.4 0l-1.3 1.3 2.8 2.8z"/></svg>',
  text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v2.6h-5.7V19h-2.6V7.6H5z"/></svg>',
  mosaic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h5v5H4zm6 0h5v5h-5zm6 0h4v5h-4zM4 10h5v5H4zm6 0h5v5h-5zm6 0h4v5h-4zM4 16h5v4H4zm6 0h5v4h-5zm6 0h4v4h-4z"/></svg>',
};

const TOOL_TITLES = { move: '选择/移动选区', rect: '矩形', ellipse: '椭圆', arrow: '箭头', pen: '画笔', text: '文字', mosaic: '马赛克' };

let layer = null;
let canvas = null;
let bar = null;
let sizeNode = null;
let holder = null;
let onSend = null;
let image = null;
let url = '';
let rect = null;
let drag = null;
let view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
let tool = 'move';
let color = COLORS[0];
let shapes = [];
let draft = null;
let textNode = null;

function toolbarHtml(canSend) {
  let tools = '';
  TOOLS.forEach((name) => {
    tools += '<button class="icon-btn shot-tool' + (name === tool ? ' is-active' : '') + '" type="button" data-shot-tool="' + name + '" title="' + TOOL_TITLES[name] + '">' + TOOL_ICONS[name] + '</button>';
  });
  let colors = '';
  COLORS.forEach((value) => {
    colors += '<button class="shot-color' + (value === color ? ' is-active' : '') + '" type="button" data-shot-color="' + value + '" style="background:' + value + '" title="' + value + '"></button>';
  });
  return '<div class="shot-bar" id="shot-bar">' +
    '<span class="shot-size mono" id="shot-size"></span>' +
    '<span class="shot-sep"></span>' + tools +
    '<span class="shot-sep"></span><span class="shot-colors" id="shot-colors">' + colors + '</span>' +
    '<span class="shot-sep"></span>' +
    '<button class="icon-btn" type="button" id="shot-undo" title="撤销一步"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5V2L5 7l6 5V9a5 5 0 1 1-5 5H4a7 7 0 1 0 7-9z"/></svg></button>' +
    '<button class="icon-btn" type="button" id="shot-save" title="保存到本地"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4L11 12.2z"/><path d="M5 18h14v2.4H5z"/></svg></button>' +
    '<button class="icon-btn" type="button" id="shot-copy" title="复制到剪贴板"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="13" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 3h9a3 3 0 0 1 3 3v9" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>' +
    '<span class="shot-sep"></span>' +
    '<button class="icon-btn" type="button" id="shot-cancel" title="取消"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4zM17.6 5l1.4 1.4L6.4 19 5 17.6z"/></svg></button>' +
    (canSend ? '<button class="icon-btn btn-primary" type="button" id="shot-confirm" title="发送到聊天">' + icon('send') + '</button>' : '') +
  '</div>';
}

function buildLayer(canSend) {
  if (layer !== null) {
    const confirm = $('#shot-confirm');
    if (confirm !== null) {
      confirm.classList.toggle('is-hidden', !canSend);
    }
    return layer;
  }
  layer = document.createElement('div');
  layer.className = 'shot-layer is-hidden';
  layer.id = 'shot-modal';
  layer.innerHTML = '<canvas id="shot-canvas"></canvas>' + toolbarHtml(canSend);
  document.body.appendChild(layer);
  canvas = $('#shot-canvas');
  bar = $('#shot-bar');
  sizeNode = $('#shot-size');
  wire();
  return layer;
}

function clip() {
  return rect ?? fullRect();
}

function imagePoint(event) {
  const scale = view.scale || 1;
  return { x: (event.clientX - view.x) / scale, y: (event.clientY - view.y) / scale };
}

function mapDisplay(point) {
  const scale = view.scale || 1;
  return { x: view.x + point.x * scale, y: view.y + point.y * scale };
}

function mapExport(sourceX, sourceY) {
  return (point) => ({ x: point.x - sourceX, y: point.y - sourceY });
}

function drawMosaic(ctx, shape, map, scale, ratio) {
  const a = map(shape.a);
  const b = map(shape.b);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w < 4 || h < 4) {
    return;
  }
  const block = Math.max(6, Math.round(10 * scale));
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(w / block));
  tmp.height = Math.max(1, Math.round(h / block));
  tmp.getContext('2d').drawImage(ctx.canvas, x * ratio, y * ratio, w * ratio, h * ratio, 0, 0, tmp.width, tmp.height);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
  ctx.imageSmoothingEnabled = smooth;
}

function drawShape(ctx, shape, map, scale) {
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = Math.max(1.5, 3 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const a = map(shape.a);
  const b = map(shape.b);
  if (shape.tool === 'rect') {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return;
  }
  if (shape.tool === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (shape.tool === 'arrow') {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(9, 15 * scale);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape.tool === 'pen') {
    ctx.beginPath();
    shape.points.forEach((point, index) => {
      const mapped = map(point);
      if (index === 0) {
        ctx.moveTo(mapped.x, mapped.y);
      } else {
        ctx.lineTo(mapped.x, mapped.y);
      }
    });
    ctx.stroke();
    return;
  }
  if (shape.tool === 'text') {
    ctx.font = 'bold ' + Math.max(11, Math.round(21 * scale)) + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(shape.text, a.x, a.y);
  }
}

function paint(ctx, map, scale, ratio, list) {
  list.forEach((shape) => {
    if (shape.tool === 'mosaic') {
      drawMosaic(ctx, shape, map, scale, ratio);
      return;
    }
    drawShape(ctx, shape, map, scale);
  });
}

function layout() {
  const ratio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const scale = image === null ? 1 : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawW = image === null ? 0 : Math.round(image.naturalWidth * scale);
  const drawH = image === null ? 0 : Math.round(image.naturalHeight * scale);
  view = { scale, x: Math.round((width - drawW) / 2), y: Math.round((height - drawH) / 2), w: drawW, h: drawH };
}

function fullRect() {
  return { x: view.x, y: view.y, w: view.w, h: view.h };
}

function positionBar(target) {
  if (bar === null) {
    return;
  }
  const barW = bar.offsetWidth || 560;
  const barH = bar.offsetHeight || 40;
  let left = target.x + target.w - barW;
  if (left + barW > window.innerWidth - 12) {
    left = window.innerWidth - barW - 12;
  }
  if (left < 12) {
    left = 12;
  }
  let top = target.y + target.h + 10;
  if (top + barH > window.innerHeight - 12) {
    top = Math.max(12, target.y - barH - 10);
  }
  bar.style.left = Math.round(left) + 'px';
  bar.style.top = Math.round(top) + 'px';
}

function drawHandles(ctx, target) {
  if (target.w >= view.w - 2) {
    return;
  }
  const spots = [
    [target.x, target.y], [target.x + target.w / 2, target.y], [target.x + target.w, target.y],
    [target.x, target.y + target.h / 2], [target.x + target.w, target.y + target.h / 2],
    [target.x, target.y + target.h], [target.x + target.w / 2, target.y + target.h], [target.x + target.w, target.y + target.h],
  ];
  ctx.fillStyle = '#00ff6a';
  spots.forEach((spot) => {
    ctx.fillRect(spot[0] - HANDLE / 2, spot[1] - HANDLE / 2, HANDLE, HANDLE);
  });
}

function draw() {
  if (canvas === null) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#0b2415';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  if (image !== null) {
    const target = clip();
    ctx.drawImage(image, view.x, view.y, view.w, view.h);
    const active = target.w >= 1 && target.h >= 1;
    if (active) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, window.innerWidth, window.innerHeight);
      ctx.rect(target.x, target.y, target.w, target.h);
      ctx.clip('evenodd');
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(target.x, target.y, target.w, target.h);
      ctx.clip();
      paint(ctx, mapDisplay, view.scale || 1, ratio, draft === null ? shapes : shapes.concat([draft]));
      ctx.restore();
      ctx.strokeStyle = '#00ff6a';
      ctx.lineWidth = 2;
      ctx.strokeRect(target.x + 1, target.y + 1, Math.max(0, target.w - 2), Math.max(0, target.h - 2));
      drawHandles(ctx, target);
      if (sizeNode !== null) {
        sizeNode.textContent = Math.round(target.w / (view.scale || 1)) + ' × ' + Math.round(target.h / (view.scale || 1));
      }
    }
  }
  positionBar(clip());
}

function exportCanvas() {
  const target = clip();
  const scale = view.scale || 1;
  const sourceX = Math.max(0, Math.round((target.x - view.x) / scale));
  const sourceY = Math.max(0, Math.round((target.y - view.y) / scale));
  const sourceW = Math.max(1, Math.min(image.naturalWidth - sourceX, Math.round(target.w / scale)));
  const sourceH = Math.max(1, Math.min(image.naturalHeight - sourceY, Math.round(target.h / scale)));
  const out = document.createElement('canvas');
  out.width = sourceW;
  out.height = sourceH;
  const ctx = out.getContext('2d');
  ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sourceW, sourceH);
  ctx.clip();
  paint(ctx, mapExport(sourceX, sourceY), 1, 1, shapes);
  ctx.restore();
  return out;
}

function blob(type, quality) {
  return new Promise((resolve) => exportCanvas().toBlob(resolve, type, quality));
}

function syncTools() {
  document.querySelectorAll('[data-shot-tool]').forEach((node) => {
    node.classList.toggle('is-active', node.dataset.shotTool === tool);
  });
  document.querySelectorAll('[data-shot-color]').forEach((node) => {
    node.classList.toggle('is-active', node.dataset.shotColor === color);
  });
}

function textCommit() {
  if (textNode === null) {
    return;
  }
  const active = textNode;
  textNode = null;
  const value = active.node.value.trim();
  active.node.remove();
  if (value === '') {
    return;
  }
  shapes.push({ tool: 'text', color, a: active.point, b: active.point, text: value });
  draw();
}

function textStart(event) {
  textCommit();
  const point = imagePoint(event);
  const node = document.createElement('input');
  node.type = 'text';
  node.className = 'shot-text';
  node.maxLength = 80;
  node.style.left = Math.round(Math.min(event.clientX, window.innerWidth - 170)) + 'px';
  node.style.top = Math.round(Math.min(event.clientY - 14, window.innerHeight - 48)) + 'px';
  document.body.appendChild(node);
  textNode = { node, point };
  node.focus();
  node.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      textCommit();
      return;
    }
    if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      const dropped = textNode;
      textNode = null;
      if (dropped !== null) {
        dropped.node.remove();
      }
      draw();
    }
  });
  node.addEventListener('blur', textCommit);
}

async function save() {
  const data = await blob('image/png');
  if (data === null) {
    toast('截屏失败', true);
    return;
  }
  const name = 'parlz-shot-' + Date.now() + '.png';
  const objectUrl = URL.createObjectURL(data);
  close();
  await downloadFile(objectUrl, name);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);
}

async function copy() {
  if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
    toast('当前环境不支持复制图片，请用「保存」', true);
    return;
  }
  const data = await blob('image/png');
  if (data === null) {
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': data })]);
    close();
    toast('已复制到剪贴板');
  } catch (error) {
    toast('复制失败，请用「保存」', true);
  }
}

async function confirmSend() {
  if (typeof onSend !== 'function') {
    return;
  }
  const data = await blob('image/webp', 0.92);
  const handler = onSend;
  close();
  if (data === null) {
    toast('截屏失败', true);
    return;
  }
  await handler(new File([data], 'screenshot.webp', { type: 'image/webp' }));
}

function clampCanvas(x, y) {
  return {
    x: Math.max(view.x, Math.min(view.x + view.w, x)),
    y: Math.max(view.y, Math.min(view.y + view.h, y)),
  };
}

function handleAt(point, target) {
  const spots = [
    ['nw', target.x, target.y], ['n', target.x + target.w / 2, target.y], ['ne', target.x + target.w, target.y],
    ['w', target.x, target.y + target.h / 2], ['e', target.x + target.w, target.y + target.h / 2],
    ['sw', target.x, target.y + target.h], ['s', target.x + target.w / 2, target.y + target.h], ['se', target.x + target.w, target.y + target.h],
  ];
  for (let i = 0; i < spots.length; i++) {
    if (Math.abs(point.x - spots[i][1]) <= HANDLE && Math.abs(point.y - spots[i][2]) <= HANDLE) {
      return spots[i][0];
    }
  }
  return '';
}

function resizeRect(start, handle, point) {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle.indexOf('w') >= 0) {
    left = point.x;
  }
  if (handle.indexOf('e') >= 0) {
    right = point.x;
  }
  if (handle.indexOf('n') >= 0) {
    top = point.y;
  }
  if (handle.indexOf('s') >= 0) {
    bottom = point.y;
  }
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    w: Math.abs(right - left),
    h: Math.abs(bottom - top),
  };
}

function wire() {
  canvas.addEventListener('pointerdown', (event) => {
    if (image === null) {
      return;
    }
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      drag = null;
    }
    if (tool === 'text') {
      textStart(event);
      return;
    }
    const point = clampCanvas(event.clientX, event.clientY);
    const target = clip();
    const unset = rect === null || target.w >= view.w - 2;
    const handle = unset ? '' : handleAt(point, target);
    if (handle !== '') {
      drag = { mode: 'resize', handle, rect: { x: target.x, y: target.y, w: target.w, h: target.h } };
      return;
    }
    const inside = !unset && point.x >= target.x && point.x <= target.x + target.w && point.y >= target.y && point.y <= target.y + target.h;
    if (tool === 'move') {
      if (inside) {
        drag = { mode: 'move', dx: point.x - target.x, dy: point.y - target.y, w: target.w, h: target.h };
        return;
      }
      drag = { mode: 'select', x: point.x, y: point.y };
      rect = { x: point.x, y: point.y, w: 0, h: 0 };
      draw();
      return;
    }
    const start = imagePoint(event);
    drag = { mode: 'draw' };
    draft = tool === 'pen'
      ? { tool: 'pen', color, points: [start], a: start, b: start }
      : { tool, color, a: start, b: start };
    draw();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (drag === null) {
      return;
    }
    if (drag.mode === 'move') {
      const point = clampCanvas(event.clientX, event.clientY);
      rect = { x: point.x - drag.dx, y: point.y - drag.dy, w: drag.w, h: drag.h };
      draw();
      return;
    }
    if (drag.mode === 'resize') {
      rect = resizeRect(drag.rect, drag.handle, clampCanvas(event.clientX, event.clientY));
      draw();
      return;
    }
    if (drag.mode === 'select') {
      const point = clampCanvas(event.clientX, event.clientY);
      rect = {
        x: Math.min(drag.x, point.x),
        y: Math.min(drag.y, point.y),
        w: Math.abs(point.x - drag.x),
        h: Math.abs(point.y - drag.y),
      };
      draw();
      return;
    }
    if (draft === null) {
      return;
    }
    const point = imagePoint(event);
    draft.b = point;
    if (draft.tool === 'pen') {
      draft.points.push(point);
    }
    draw();
  });

  canvas.addEventListener('pointerup', () => {
    if (drag === null) {
      return;
    }
    const mode = drag.mode;
    drag = null;
    if (mode === 'select') {
      if (rect === null || rect.w < 8 || rect.h < 8) {
        rect = fullRect();
      }
      draw();
      return;
    }
    if (draft === null) {
      return;
    }
    const shape = draft;
    draft = null;
    const scale = view.scale || 1;
    const wide = Math.abs(shape.b.x - shape.a.x) * scale;
    const tall = Math.abs(shape.b.y - shape.a.y) * scale;
    if (shape.tool === 'pen' ? shape.points.length > 1 : (wide > 3 || tall > 3)) {
      shapes.push(shape);
    }
    draw();
  });

  document.querySelectorAll('[data-shot-tool]').forEach((node) => {
    node.addEventListener('click', () => {
      textCommit();
      tool = String(node.dataset.shotTool ?? 'rect');
      syncTools();
    });
  });

  document.querySelectorAll('[data-shot-color]').forEach((node) => {
    node.addEventListener('click', () => {
      color = String(node.dataset.shotColor ?? COLORS[0]);
      syncTools();
    });
  });

  $('#shot-undo').addEventListener('click', () => {
    textCommit();
    shapes.pop();
    draw();
  });
  $('#shot-save').addEventListener('click', () => {
    save().catch(() => close());
  });
  $('#shot-copy').addEventListener('click', () => {
    copy().catch(() => close());
  });
  $('#shot-cancel').addEventListener('click', () => close());
  const confirm = $('#shot-confirm');
  if (confirm !== null) {
    confirm.addEventListener('click', () => {
      confirmSend().catch(() => close());
    });
  }

  document.addEventListener('keydown', (event) => {
    if (layer === null || layer.classList.contains('is-hidden')) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      confirmSend().catch(() => close());
    } else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      shapes.pop();
      draw();
    }
  });

  window.addEventListener('resize', () => {
    if (layer !== null && !layer.classList.contains('is-hidden')) {
      layout();
      rect = fullRect();
      draw();
    }
  });
}

export function close() {
  textCommit();
  if (layer !== null) {
    layer.classList.add('is-hidden');
  }
  if (url !== '') {
    URL.revokeObjectURL(url);
    url = '';
  }
  image = null;
  rect = null;
  drag = null;
  draft = null;
  shapes = [];
  onSend = null;
}

export function show(imageUrl, options) {
  const settings = options ?? {};
  buildLayer(typeof settings.onSend === 'function' || settings.canSend === true);
  onSend = typeof settings.onSend === 'function' ? settings.onSend : null;
  const img = new Image();
  img.onload = () => {
    image = img;
    url = imageUrl;
    shapes = [];
    draft = null;
    tool = 'move';
    color = COLORS[0];
    layout();
    rect = fullRect();
    syncTools();
    layer.classList.remove('is-hidden');
    draw();
  };
  img.src = imageUrl;
}

export async function capture() {
  const bridge = window.ParlzDesktop;
  if (bridge === null || typeof bridge !== 'object' || typeof bridge.captureScreen !== 'function') {
    toast('当前环境不支持截屏', true);
    return '';
  }
  try {
    const data = await bridge.captureScreen();
    return typeof data === 'string' ? data : '';
  } catch (error) {
    toast('截屏失败', true);
    return '';
  }
}
