export function qrSvg(text, cellSize = 6, margin = 2) {
  const factory = window.qrcode;
  if (typeof factory !== 'function') {
    return '';
  }
  try {
    const qr = factory(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr.createSvgTag({ cellSize, margin, scalable: false });
  } catch (error) {
    return '';
  }
}

export function qrMount(host, text, size = 260) {
  if (host === null || host === undefined) {
    return;
  }
  const cell = Math.max(3, Math.round(size / 33));
  const svg = qrSvg(text, cell, 2);
  host.innerHTML = svg === '' ? '<p class="empty-note">二维码组件加载失败</p>' : svg;
}
