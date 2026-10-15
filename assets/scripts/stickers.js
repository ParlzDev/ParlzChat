const face = (inner) =>
  '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
  '<circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2"/>' +
  inner +
  '</svg>';

const eyesDot = '<circle cx="12" cy="13.5" r="1.7" fill="currentColor"/>' +
  '<circle cx="20" cy="13.5" r="1.7" fill="currentColor"/>';

const smileArc = '<path d="M10.5 19.5a6 6 0 0 0 11 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';

const grinArc = '<path d="M10 18h12a6 6 0 0 1-12 0z" fill="currentColor"/>';

const frownArc = '<path d="M11 22.5a6 6 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';

const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const stickers = {
  smile: face(eyesDot + smileArc),
  grin: face(eyesDot + grinArc),
  laugh: face(
    '<path d="M9.6 13.4l2.4-2.4 2.4 2.4" ' + stroke + '/>' +
    '<path d="M17.6 13.4l2.4-2.4 2.4 2.4" ' + stroke + '/>' +
    grinArc,
  ),
  wink: face(
    '<path d="M9.8 13.4a3.2 3.2 0 0 0 4.4 0" ' + stroke + '/>' +
    '<circle cx="20" cy="13.5" r="1.7" fill="currentColor"/>' +
    '<path d="M11 19.6c2.6 2.4 7 1.4 9-1.6" ' + stroke + '/>',
  ),
  love: face(
    '<path d="M12 15.6s-2.7-1.7-2.7-3.5a1.6 1.6 0 0 1 2.7-1.05A1.6 1.6 0 0 1 14.7 12c0 1.8-2.7 3.5-2.7 3.5z" fill="currentColor"/>' +
    '<path d="M20 15.6s-2.7-1.7-2.7-3.5a1.6 1.6 0 0 1 2.7-1.05A1.6 1.6 0 0 1 22.7 12c0 1.8-2.7 3.5-2.7 3.5z" fill="currentColor"/>' +
    smileArc,
  ),
  cool: face(
    '<rect x="7.4" y="11.4" width="7.2" height="5" rx="1.6" fill="currentColor"/>' +
    '<rect x="17.4" y="11.4" width="7.2" height="5" rx="1.6" fill="currentColor"/>' +
    '<path d="M14.6 13.4h2.8" stroke="currentColor" stroke-width="1.6"/>' +
    smileArc,
  ),
  cry: face(
    eyesDot +
    '<path d="M21.6 17s-2 2.5-2 3.7a2 2 0 0 0 4 0c0-1.2-2-3.7-2-3.7z" fill="currentColor"/>' +
    frownArc,
  ),
  angry: face(
    '<path d="M8.8 10.4l4.6 2.3" ' + stroke + '/>' +
    '<path d="M23.2 10.4l-4.6 2.3" ' + stroke + '/>' +
    eyesDot +
    frownArc,
  ),
  surprise: face(
    eyesDot +
    '<circle cx="16" cy="20.6" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/>',
  ),
  sleep: face(
    '<path d="M9.8 13.6h4.4" ' + stroke + '/>' +
    '<path d="M17.8 13.6h4.4" ' + stroke + '/>' +
    '<path d="M13.6 20.6a3.4 3.4 0 0 0 4.8 0" ' + stroke + '/>' +
    '<path d="M21.4 4.6h4.4l-4.4 4.6h4.4" ' + stroke + '/>',
  ),
  heart: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M16 27.4S5.6 20.6 5.6 13.5A6.2 6.2 0 0 1 16 9.4a6.2 6.2 0 0 1 10.4 4.1c0 7.1-10.4 13.9-10.4 13.9z" fill="var(--sticker-fill)"/></svg>',
  star: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M16 3.4l3.7 7.9 8.6 1.1-6.3 6.1 1.6 8.5L16 23l-7.6 4 1.6-8.5-6.3-6.1 8.6-1.1z" fill="var(--sticker-fill)"/></svg>',
  smug: face(
    '<path d="M9.8 13.4h4.2" ' + stroke + '/>' +
    '<path d="M18 13.4h4.2" ' + stroke + '/>' +
    '<path d="M11 19.2c2.6 2.2 6.6 1.4 9-1.4" ' + stroke + '/>' +
    '<path d="M23.4 5.8l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="currentColor"/>',
  ),
  sneak: face(
    '<path d="M9.8 14.2a3 3 0 0 1 4.4 0" ' + stroke + '/>' +
    '<path d="M17.8 14.2a3 3 0 0 1 4.4 0" ' + stroke + '/>' +
    '<path d="M12.4 19.6c1.8 1.4 5.4 1.4 7.2-.2" ' + stroke + '/>' +
    '<circle cx="8.4" cy="17.6" r="1.5" fill="currentColor"/>' +
    '<circle cx="23.6" cy="17.6" r="1.5" fill="currentColor"/>',
  ),
  pout: face(
    eyesDot +
    '<path d="M12.6 21.6c1.6-1.8 3.2-1.8 4.8-.4" ' + stroke + '/>' +
    '<circle cx="8.6" cy="17.8" r="1.4" fill="currentColor"/>' +
    '<circle cx="23.4" cy="17.8" r="1.4" fill="currentColor"/>',
  ),
  doubt: face(
    eyesDot +
    '<path d="M13.8 21h4.4" ' + stroke + '/>' +
    '<path d="M21.8 4.6c1.8 0 3.2 1.3 3.2 3 0 2.1-2.7 2.5-2.7 4.5" ' + stroke + '/>' +
    '<circle cx="22.3" cy="14.9" r="1.1" fill="currentColor"/>',
  ),
  speechless: face(
    '<path d="M9.8 13.6h4.4" ' + stroke + '/>' +
    '<path d="M17.8 13.6h4.4" ' + stroke + '/>' +
    '<path d="M12.6 20.6h6.8" ' + stroke + '/>' +
    '<path d="M23.4 16.4s-1.7 2.2-1.7 3.2a1.7 1.7 0 0 0 3.4 0c0-1-1.7-3.2-1.7-3.2z" fill="currentColor"/>',
  ),
  fear: face(
    '<circle cx="11.8" cy="13" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="20.2" cy="13" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<ellipse cx="16" cy="21" rx="3" ry="3.6" fill="currentColor"/>',
  ),
  clap: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M12.6 23.4c-2.6-.7-4.4-2.8-4.8-5.4l-.7-5.2a1.5 1.5 0 0 1 2.7-.8l1.8 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M19.4 23.4c2.6-.7 4.4-2.8 4.8-5.4l.7-5.2a1.5 1.5 0 0 0-2.7-.8l-1.8 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M16 4.8v3.4M9.4 7.2l1.8 2.8M22.6 7.2l-1.8 2.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>',
  rocket: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M16 3.4c3.4 2.9 5 6.5 5 10.2l-2.4 3.2h-5.2L11 13.6c0-3.7 1.6-7.3 5-10.2z" fill="var(--sticker-fill)"/>' +
    '<path d="M11.6 16.4l-3.4 3.6 3.9-.7M20.4 16.4l3.4 3.6-3.9-.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M16 20.2v3.2M12.8 25.2l1-2.6M19.2 25.2l-1-2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>',
  melon: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M4.8 25.6L16 6.8l11.2 18.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M9.6 21.4h12.8" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="14" cy="17.6" r="1.2" fill="currentColor"/>' +
    '<circle cx="18.6" cy="18.8" r="1.2" fill="currentColor"/>' +
    '<circle cx="16.4" cy="14.6" r="1.2" fill="currentColor"/>' +
    '</svg>',
  moon: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M20.4 4.4a11.4 11.4 0 1 0 7.2 20.2A12.2 12.2 0 0 1 20.4 4.4z" fill="var(--sticker-fill)"/>' +
    '<circle cx="24.6" cy="10.2" r="1.4" fill="currentColor"/>' +
    '<circle cx="27.6" cy="16.2" r="1" fill="currentColor"/>' +
    '</svg>',
  fire: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M16 3.2c4.6 4.6 7.6 8.2 7.6 13a7.6 7.6 0 0 1-15.2 0c0-2.6 1-5 2.6-7.2.6 1.8 1.6 2.8 2.8 3.2-.4-3.4.2-6.6 2.2-9z" fill="var(--sticker-fill)"/>' +
    '</svg>',
  cake: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M7 26V18.4c0-1.3 1-2.4 2.4-2.4h13.2c1.3 0 2.4 1 2.4 2.4V26z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M11 16v-3.6M21 16v-3.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M16 16v-5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M16 4.6c1.1 0 1.9-1 1.9-2.1 0-1.3-1.9-2.5-1.9-2.5s-1.9 1.2-1.9 2.5c0 1.1.8 2.1 1.9 2.1z" fill="var(--sticker-fill)"/>' +
    '</svg>',
  paw: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<ellipse cx="16" cy="21.4" rx="5.4" ry="4.6" fill="var(--sticker-fill)"/>' +
    '<circle cx="9.2" cy="14.2" r="2.2" fill="currentColor"/>' +
    '<circle cx="13.8" cy="10.8" r="2.3" fill="currentColor"/>' +
    '<circle cx="18.4" cy="10.8" r="2.3" fill="currentColor"/>' +
    '<circle cx="23" cy="14.2" r="2.2" fill="currentColor"/>' +
    '</svg>',
  bunny: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M11.4 13.6C9.8 9.6 9.4 4.6 11.6 3.4c2.2-1.2 3.6 3.2 3.8 7.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M20.6 13.6c1.6-4 2-9-.2-10.2-2.2-1.2-3.6 3.2-3.8 7.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="16" cy="19.6" r="8.2" fill="var(--sticker-fill)"/>' +
    '<circle cx="13" cy="18.2" r="1.2" fill="var(--on-green)"/>' +
    '<circle cx="19" cy="18.2" r="1.2" fill="var(--on-green)"/>' +
    '<path d="M14.8 22.2c.7.9 1.7.9 2.4 0" fill="none" stroke="var(--on-green)" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>',
  ghost: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M8 24.6V15.4a8 8 0 0 1 16 0v9.2l-2.6-2-2.7 2-2.7-2-2.7 2z" fill="var(--sticker-fill)"/>' +
    '<circle cx="13" cy="14.6" r="1.3" fill="var(--on-green)"/>' +
    '<circle cx="19" cy="14.6" r="1.3" fill="var(--on-green)"/>' +
    '<path d="M13.8 18.8c1.4 1.2 3 1.2 4.4 0" fill="none" stroke="var(--on-green)" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>',
  gift: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<rect x="6.4" y="13.6" width="19.2" height="12.8" rx="1.6" fill="var(--sticker-fill)"/>' +
    '<rect x="4.6" y="9.6" width="22.8" height="5" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M16 9.6v16.8" fill="none" stroke="var(--on-green)" stroke-width="2"/>' +
    '<path d="M16 9.4c-2.6 0-5-1.4-5-3.4 0-1.6 1.4-2.4 2.8-2 1.6.5 2.2 2.6 2.2 5.4zM16 9.4c2.6 0 5-1.4 5-3.4 0-1.6-1.4-2.4-2.8-2-1.6.5-2.2 2.6-2.2 5.4z" fill="var(--sticker-fill)"/>' +
    '</svg>',
  coffee: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M7.4 13.2h14.4v6.6a6 6 0 0 1-6 6h-2.4a6 6 0 0 1-6-6z" fill="var(--sticker-fill)"/>' +
    '<path d="M21.8 15h2.2a2.8 2.8 0 0 1 0 5.6h-2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M11.4 9.4c0-1.4 1.4-1.6 1.4-3M16 9.4c0-1.4 1.4-1.6 1.4-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>',
  thumbsup: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M11 14.6l4.4-9.2c2 0 3.2 1.4 3.2 3.4 0 1.6-.6 3-1 4.2h5.6c1.8 0 3 1.6 2.6 3.4l-1.8 7.4c-.3 1.3-1.4 2.2-2.8 2.2H11z" fill="var(--sticker-fill)"/>' +
    '<rect x="4.6" y="14.6" width="5.2" height="11.8" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '</svg>',
  beat: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<g transform="translate(16 16)"><g>' +
    '<circle cx="-2.4" cy="-1.6" r="2.8" fill="var(--sticker-fill)"/>' +
    '<circle cx="2.4" cy="-1.6" r="2.8" fill="var(--sticker-fill)"/>' +
    '<path d="M-4.9-0.4L0 4.8 4.9-0.4z" fill="var(--sticker-fill)"/>' +
    '<animateTransform attributeName="transform" type="scale" values="1;1.16;1" keyTimes="0;0.42;1" dur="1.1s" repeatCount="indefinite"/>' +
    '</g></g>' +
    '</svg>',
  twinkle: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<g transform="translate(15.4 16)"><g>' +
    '<path d="M0-9.2L2.4-2.4 9.2 0 2.4 2.4 0 9.2-2.4 2.4-9.2 0-2.4-2.4z" fill="var(--sticker-fill)"/>' +
    '<animateTransform attributeName="transform" type="scale" values="1;0.7;1" keyTimes="0;0.5;1" dur="1.6s" repeatCount="indefinite"/>' +
    '</g></g>' +
    '<circle cx="25.2" cy="8.4" r="1.7" fill="currentColor">' +
    '<animate attributeName="opacity" values="1;0.15;1" dur="1.5s" repeatCount="indefinite"/>' +
    '</circle>' +
    '<circle cx="6.6" cy="23.6" r="1.4" fill="currentColor">' +
    '<animate attributeName="opacity" values="0.15;1;0.15" dur="1.7s" repeatCount="indefinite"/>' +
    '</circle>' +
    '</svg>',
  blaze: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<g transform="translate(16 26.4)"><g>' +
    '<g transform="translate(-16 -26.4)">' +
    '<path d="M16 3.2c4.6 4.6 7.6 8.2 7.6 13a7.6 7.6 0 0 1-15.2 0c0-2.6 1-5 2.6-7.2.6 1.8 1.6 2.8 2.8 3.2-.4-3.4.2-6.6 2.2-9z" fill="var(--sticker-fill)"/>' +
    '</g>' +
    '<animateTransform attributeName="transform" type="scale" values="1 1;1.05 1.12;1 1" keyTimes="0;0.5;1" dur="0.85s" repeatCount="indefinite"/>' +
    '</g></g>' +
    '</svg>',
  sunny: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<g transform="translate(16 16)">' +
    '<g>' +
    '<path d="M0-11.6V-8.4M8.2-8.2L6-6M11.6 0H8.4M8.2 8.2L6 6M0 11.6V8.4M-8.2 8.2L-6 6M-11.6 0H-8.4M-8.2-8.2L-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<animateTransform attributeName="transform" type="rotate" values="0;360" dur="9s" repeatCount="indefinite"/>' +
    '</g>' +
    '<circle r="6.4" fill="var(--sticker-fill)"/>' +
    '</g>' +
    '</svg>',
  rainy: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<path d="M10.4 18.4a4.6 4.6 0 0 1 .7-9.1 6.4 6.4 0 0 1 12.2 1.7 4 4 0 0 1-1 7.4z" fill="var(--sticker-fill)"/>' +
    '<line x1="12.4" y1="22.6" x2="12.4" y2="25.6" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<animate attributeName="opacity" values="0;1;0" dur="1.3s" repeatCount="indefinite"/>' +
    '<animateTransform attributeName="transform" type="translate" values="0 -2;0 2.6" dur="1.3s" repeatCount="indefinite"/>' +
    '</line>' +
    '<line x1="17" y1="22.6" x2="17" y2="25.6" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0.35s" repeatCount="indefinite"/>' +
    '<animateTransform attributeName="transform" type="translate" values="0 -2;0 2.6" dur="1.3s" begin="0.35s" repeatCount="indefinite"/>' +
    '</line>' +
    '<line x1="21.6" y1="22.6" x2="21.6" y2="25.6" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0.7s" repeatCount="indefinite"/>' +
    '<animateTransform attributeName="transform" type="translate" values="0 -2;0 2.6" dur="1.3s" begin="0.7s" repeatCount="indefinite"/>' +
    '</line>' +
    '</svg>',
  note: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<g transform="translate(16.4 16.6)"><g>' +
    '<path d="M1 5V-9.6c3 1.2 5.4 2.8 6 5.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<ellipse cx="-2.2" cy="5.4" rx="3.4" ry="2.8" fill="var(--sticker-fill)"/>' +
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.4;0 0" keyTimes="0;0.5;1" dur="0.9s" repeatCount="indefinite"/>' +
    '</g></g>' +
    '</svg>',
  candle: '<svg viewBox="0 0 32 32" class="sticker-svg" aria-hidden="true">' +
    '<rect x="10.6" y="14.4" width="10.8" height="14.6" rx="1.6" fill="var(--sticker-fill)"/>' +
    '<path d="M16 12.6c1.7 0 3-1.5 3-3.3 0-2.1-3-4.9-3-4.9s-3 2.8-3 4.9c0 1.8 1.3 3.3 3 3.3z" fill="currentColor">' +
    '<animateTransform attributeName="transform" type="scale" values="1;1.12 0.94;1" keyTimes="0;0.5;1" dur="0.7s" repeatCount="indefinite" additive="sum"/>' +
    '<animate attributeName="opacity" values="1;0.75;1" dur="0.7s" repeatCount="indefinite"/>' +
    '</path>' +
    '<path d="M16 12.4V9" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '</svg>',
};

export function stickerNames() {
  return Object.keys(stickers);
}

const ANIMATED = ['beat', 'twinkle', 'blaze', 'sunny', 'rainy', 'note', 'candle'];

export function animatedStickerNames() {
  return ANIMATED.slice();
}

export function staticStickerNames() {
  return stickerNames().filter((name) => ANIMATED.indexOf(name) === -1);
}

export function stickerSvg(name) {
  return stickers[name] ?? '';
}

export function stickerByLabel(label) {
  const name = NAME_BY_LABEL[label];
  return name === undefined ? '' : stickers[name];
}

const LABELS = {
  smile: '微笑',
  grin: '呲牙',
  laugh: '大笑',
  wink: '眨眼',
  love: '花痴',
  cool: '酷',
  cry: '大哭',
  angry: '发怒',
  surprise: '惊讶',
  sleep: '睡觉',
  heart: '爱心',
  star: '星星',
  smug: '得意',
  sneak: '偷笑',
  pout: '委屈',
  doubt: '疑问',
  speechless: '无语',
  fear: '惊恐',
  clap: '鼓掌',
  rocket: '加油',
  melon: '吃瓜',
  moon: '月亮',
  fire: '火',
  cake: '蛋糕',
  paw: '爪印',
  bunny: '兔子',
  ghost: '幽灵',
  gift: '礼物',
  coffee: '咖啡',
  thumbsup: '点赞',
  beat: '心跳',
  twinkle: '闪亮',
  blaze: '火爆',
  sunny: '太阳',
  rainy: '下雨',
  note: '音符',
  candle: '蜡烛',
};

const NAME_BY_LABEL = {};
Object.keys(LABELS).forEach((name) => {
  NAME_BY_LABEL[LABELS[name]] = name;
});

export function stickerToken(name) {
  return '[' + (LABELS[name] ?? name) + ']';
}

export function stickerLabel(name) {
  return LABELS[name] ?? name;
}
