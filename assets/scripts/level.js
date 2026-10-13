const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z"/><path d="M11.1 1.4h1.8v3.1h-1.8zm0 18.1h1.8v3.1h-1.8zM1.4 11.1h3.1v1.8H1.4zm18.1 0h3.1v1.8h-3.1zM4.2 5.4l1.3-1.3 2.2 2.2-1.3 1.3zm12.1 12.3l1.3-1.3 2.2 2.2-1.3 1.3zM18.6 4.1l1.3 1.3-2.2 2.2-1.3-1.3zM5.1 16.4l1.3 1.3-2.2 2.2-1.3-1.3z"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 2.6a9.4 9.4 0 1 0 5.8 16.8 9.8 9.8 0 0 1-5.8-16.8z"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.9l-5.8 3 1.1-6.5L2.6 9.7l6.5-.9z"/></svg>';

export function levelParts(level) {
  const value = Math.max(0, Math.floor(Number(level) || 0));
  return {
    suns: Math.floor(value / 16),
    moons: Math.floor((value % 16) / 4),
    stars: value % 4,
    level: value,
  };
}

export function levelChips(level, withLabel = false) {
  const parts = levelParts(level);
  if (parts.level <= 0) {
    return '';
  }
  let icons = '';
  for (let i = 0; i < Math.min(parts.suns, 4); i += 1) {
    icons += '<span class="lv-sun">' + SUN + '</span>';
  }
  for (let i = 0; i < Math.min(parts.moons, 4); i += 1) {
    icons += '<span class="lv-moon">' + MOON + '</span>';
  }
  for (let i = 0; i < parts.stars; i += 1) {
    icons += '<span class="lv-star">' + STAR + '</span>';
  }
  const label = withLabel ? '<span class="lv-text mono">Lv.' + parts.level + '</span>' : '';
  return '<span class="lv" title="等级 ' + parts.level + '">' + icons + label + '</span>';
}
