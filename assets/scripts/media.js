import { esc } from './util.js';
import { icon } from './icons.js';

const VOLUME_KEY = 'parlz-volume';

function storedVolume() {
  try {
    const value = Number(window.localStorage.getItem(VOLUME_KEY));
    return isFinite(value) && value >= 0 && value <= 1 ? value : 1;
  } catch (error) {
    return 1;
  }
}

function saveVolume(value) {
  try {
    window.localStorage.setItem(VOLUME_KEY, String(value));
  } catch (error) {
    return;
  }
}

function volumeIcon(value) {
  return value <= 0.01 ? icon('volumeMute') : icon('volume');
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) {
    return '--:--';
  }
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return m + ':' + String(s).padStart(2, '0');
}

function downloadButton(node) {
  return '<button type="button" class="media-dl" data-file="' + esc(node.dataset.file ?? '') + '" data-name="' + esc(node.dataset.name ?? '') + '" title="下载">' + icon('download') + '</button>';
}

function buildVideo(node, media) {
  node.innerHTML = '';
  node.appendChild(media);
  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.className = 'mp-center';
  overlay.title = '播放';
  overlay.innerHTML = icon('play');
  node.appendChild(overlay);
  const controls = document.createElement('div');
  controls.className = 'mp-controls';
  controls.innerHTML =
    '<button type="button" class="mp-toggle" title="播放/暂停">' + icon('play') + '</button>' +
    '<div class="mp-track"><span class="mp-fill"></span><span class="mp-knob"></span></div>' +
    '<span class="mp-time mono">0:00 / --:--</span>' +
    '<button type="button" class="mp-full" title="全屏">' + icon('expand') + '</button>' +
    '<span class="mp-vol-wrap"><button type="button" class="mp-vol" title="音量">' + icon('volume') + '</button>' +
    '<div class="mp-vtrack"><span class="mp-vfill"></span><span class="mp-vknob"></span></div></span>' +
    downloadButton(node);
  node.appendChild(controls);
}

function buildAudio(node, media) {
  node.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'mp-head';
  head.innerHTML = icon('music') +
    '<span class="mp-titles"><span class="file-name">' + esc(node.dataset.name ?? '') + '</span>' +
    '<span class="file-size">' + esc(node.dataset.size ?? '') + '</span></span>' +
    downloadButton(node);
  node.appendChild(head);
  const controls = document.createElement('div');
  controls.className = 'mp-controls';
  controls.innerHTML =
    '<button type="button" class="mp-toggle" title="播放/暂停">' + icon('play') + '</button>' +
    '<div class="mp-track"><span class="mp-fill"></span><span class="mp-knob"></span></div>' +
    '<span class="mp-time mono">0:00 / --:--</span>' +
    '<span class="mp-vol-wrap"><button type="button" class="mp-vol" title="音量">' + icon('volume') + '</button>' +
    '<div class="mp-vtrack"><span class="mp-vfill"></span><span class="mp-vknob"></span></div></span>';
  node.appendChild(controls);
  node.appendChild(media);
  media.className = 'mp-audio-el';
}

function capturePointer(node, pointerId) {
  try {
    node.setPointerCapture(pointerId);
  } catch (error) {
    return;
  }
}

function pauseOthers(media) {
  document.querySelectorAll('.mplayer audio, .mplayer video').forEach((other) => {
    if (other !== media && !other.paused) {
      other.pause();
    }
  });
}

document.addEventListener('pointerdown', (event) => {
  document.querySelectorAll('.mp-vol-wrap.is-open').forEach((wrap) => {
    if (!wrap.contains(event.target)) {
      wrap.classList.remove('is-open');
    }
  });
}, true);

function buildVoice(node, media) {
  node.innerHTML = '';
  const heights = [30, 55, 80, 45, 95, 60, 35, 70, 50, 25];
  const bars = heights.map((h) => '<span class="voice-bar" style="height:' + h + '%"></span>').join('');
  node.innerHTML =
    '<button type="button" class="voice-toggle" title="播放">' + icon('play') + '</button>' +
    '<span class="voice-wave">' + bars + '</span>' +
    '<span class="voice-dur mono">' + esc(node.dataset.dur ?? '1') + '″</span>';
  node.appendChild(media);
  media.className = 'mp-audio-el';
}

function wireVoice(node, media) {
  const toggle = node.querySelector('.voice-toggle');
  const sync = () => {
    const playing = !media.paused && !media.ended;
    toggle.innerHTML = playing ? icon('pause') : icon('play');
    node.classList.toggle('is-playing', playing);
  };
  toggle.addEventListener('click', () => {
    if (media.paused || media.ended) {
      pauseOthers(media);
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  });
  media.addEventListener('play', sync);
  media.addEventListener('pause', sync);
  media.addEventListener('ended', () => {
    media.currentTime = 0;
    sync();
  });
  sync();
}

function build(node) {
  if (node.dataset.ready === '1') {
    return;
  }
  node.dataset.ready = '1';
  const raw = node.dataset.media;
  const kind = raw === 'video' ? 'video' : raw === 'voice' ? 'voice' : 'audio';
  node.classList.add('mplayer', 'mplayer-' + kind);
  const media = document.createElement(kind === 'video' ? 'video' : 'audio');
  media.preload = 'metadata';
  media.playsInline = true;
  media.src = node.dataset.src ?? '';
  if (kind === 'video') {
    buildVideo(node, media);
  } else if (kind === 'voice') {
    buildVoice(node, media);
  } else {
    buildAudio(node, media);
  }

  if (kind === 'voice') {
    wireVoice(node, media);
    return;
  }

  const toggle = node.querySelector('.mp-toggle');
  const center = node.querySelector('.mp-center');
  const full = node.querySelector('.mp-full');
  const track = node.querySelector('.mp-track');
  const fill = node.querySelector('.mp-fill');
  const knob = node.querySelector('.mp-knob');
  const time = node.querySelector('.mp-time');

  const syncIcon = () => {
    const playing = !media.paused && !media.ended;
    toggle.innerHTML = playing ? icon('pause') : icon('play');
    node.classList.toggle('is-playing', playing);
  };
  const progress = () => {
    const dur = isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
    const pct = dur > 0 ? Math.min(100, Math.max(0, (media.currentTime / dur) * 100)) : 0;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    time.textContent = fmtTime(media.currentTime) + ' / ' + fmtTime(media.duration);
  };
  const togglePlay = () => {
    if (media.paused || media.ended) {
      pauseOthers(media);
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  };

  toggle.addEventListener('click', togglePlay);
  if (center !== null) {
    center.addEventListener('click', togglePlay);
  }
  if (kind === 'video') {
    media.addEventListener('click', togglePlay);
  }
  if (full !== null) {
    full.addEventListener('click', () => {
      if (document.fullscreenElement === node) {
        document.exitFullscreen().catch(() => {});
      } else {
        node.requestFullscreen().catch(() => {});
      }
    });
  }

  let scrubbing = false;
  const seekFrom = (event) => {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0 || !isFinite(media.duration) || media.duration <= 0) {
      return;
    }
    const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    media.currentTime = pct * media.duration;
    progress();
  };
  track.addEventListener('pointerdown', (event) => {
    scrubbing = true;
    capturePointer(track, event.pointerId);
    seekFrom(event);
  });
  track.addEventListener('pointermove', (event) => {
    if (scrubbing) {
      seekFrom(event);
    }
  });  const stopScrub = () => {
    scrubbing = false;
  };
  track.addEventListener('pointerup', stopScrub);
  track.addEventListener('pointercancel', stopScrub);

  media.addEventListener('loadedmetadata', progress);
  media.addEventListener('durationchange', progress);
  media.addEventListener('timeupdate', progress);
  media.addEventListener('play', syncIcon);
  media.addEventListener('pause', syncIcon);
  media.addEventListener('ended', () => {
    syncIcon();
    progress();
  });

  const volBtn = node.querySelector('.mp-vol');
  const volWrap = node.querySelector('.mp-vol-wrap');
  const vtrack = node.querySelector('.mp-vtrack');
  const vfill = node.querySelector('.mp-vfill');
  const vknob = node.querySelector('.mp-vknob');
  const applyVolume = (value) => {
    saveVolume(value);
    document.querySelectorAll('.mplayer audio, .mplayer video').forEach((other) => {
      other.volume = value;
      const holder = other.closest('.mplayer');
      if (holder === null) {
        return;
      }
      const btn = holder.querySelector('.mp-vol');
      const fill = holder.querySelector('.mp-vfill');
      const knob = holder.querySelector('.mp-vknob');
      if (btn !== null) {
        btn.innerHTML = volumeIcon(value);
      }
      if (fill !== null) {
        fill.style.height = value * 100 + '%';
      }
      if (knob !== null) {
        knob.style.bottom = value * 100 + '%';
      }
    });
  };
  media.volume = storedVolume();
  applyVolume(media.volume);
  volBtn.addEventListener('click', () => {
    volWrap.classList.toggle('is-open');
  });
  let volScrub = false;
  const volFrom = (event) => {
    const rect = vtrack.getBoundingClientRect();
    if (rect.height <= 0) {
      return;
    }
    applyVolume(Math.min(1, Math.max(0, (rect.bottom - event.clientY) / rect.height)));
  };
  vtrack.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    volScrub = true;
    capturePointer(vtrack, event.pointerId);
    volFrom(event);
  });
  vtrack.addEventListener('pointermove', (event) => {
    if (volScrub) {
      volFrom(event);
    }
  });
  const stopVol = () => {
    volScrub = false;
  };
  vtrack.addEventListener('pointerup', stopVol);
  vtrack.addEventListener('pointercancel', stopVol);

  progress();
  syncIcon();
}

export function mediaUpgrade(root) {
  if (root === null || root === undefined) {
    return;
  }
  root.querySelectorAll('.mplayer[data-media]').forEach(build);
}
