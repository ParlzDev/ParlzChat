import { $ } from './util.js';
import { apiFormProgress } from './api.js';

let inflight = 0;

function setBar(name, percent) {
  const bar = $('#upload-bar');
  if (bar === null) {
    return;
  }
  const nameNode = $('#upload-name');
  const fillNode = $('#upload-fill');
  const pctNode = $('#upload-pct');
  if (nameNode !== null) {
    nameNode.textContent = name;
  }
  if (fillNode !== null) {
    fillNode.style.width = percent + '%';
  }
  if (pctNode !== null) {
    pctNode.textContent = percent + '%';
  }
  bar.classList.remove('is-hidden');
}

function finish() {
  inflight = Math.max(0, inflight - 1);
  if (inflight === 0) {
    const bar = $('#upload-bar');
    if (bar !== null) {
      bar.classList.add('is-hidden');
    }
  }
}

export function uploadFile(path, formData, name) {
  inflight += 1;
  setBar(name, 0);
  return apiFormProgress(path, formData, (percent) => setBar(name, percent)).then(
    (res) => {
      finish();
      return res;
    },
    (error) => {
      finish();
      throw error;
    },
  );
}
