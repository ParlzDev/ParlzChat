export function qrSvg(text) {
  const factory = window.qrcode;
  if (typeof factory !== 'function') {
    return '';
  }
  try {
    const qr = factory(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: false });
  } catch (error) {
    return '';
  }
}
