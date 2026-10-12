const STORAGE_KEY = 'parlz-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function themePref() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch (error) {
    return 'system';
  }
}

function resolve(pref) {
  if (pref === 'light' || pref === 'dark') {
    return pref;
  }
  return media.matches ? 'dark' : 'light';
}

export function applyTheme(pref) {
  const next = pref === 'light' || pref === 'dark' ? pref : 'system';
  document.documentElement.setAttribute('data-theme', resolve(next));
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch (error) {
    return next;
  }
  return next;
}

media.addEventListener('change', () => {
  if (themePref() === 'system') {
    document.documentElement.setAttribute('data-theme', resolve('system'));
  }
});
