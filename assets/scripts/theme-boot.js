(function () {
  var pref = 'system';
  try {
    var stored = window.localStorage.getItem('parlz-theme');
    if (stored === 'dark' || stored === 'light') {
      pref = stored;
    }
  } catch (error) {
    pref = 'system';
  }
  var resolved = pref === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : pref;
  document.documentElement.setAttribute('data-theme', resolved);
})();
