import { emit } from './state.js';
import { $, toast, paintPage, pageView } from './util.js';
import { apiPost } from './api.js';

let currentCode = '';

export function render(code) {
  currentCode = String(code ?? '');
  if (currentCode === '') {
    paintPage('scan', '扫码登录', '<p class="empty-note">二维码无效，请重新扫码</p>');
    return;
  }
  paintPage('scan', '扫码登录',
    '<div class="setting-block scan-card">' +
      '<h3 class="section-title">确认在电脑上登录 Parlz？</h3>' +
      '<p class="setting-desc">确认后，你正在使用的这台电脑将登录当前账号</p>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn btn-primary" data-act="scan-ok">确认登录</button>' +
        '<button type="button" class="btn" data-act="scan-cancel">取消</button>' +
      '</div>' +
    '</div>');
}

export function init() {
  $('#page-view').addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (target === null || pageView() !== 'scan') {
      return;
    }
    const act = target.dataset.act;
    if (act === 'scan-ok') {
      apiPost('api/auth.php', { action: 'scan-confirm', code: currentCode })
        .then(() => {
          toast('已确认，电脑端会自动登录');
          emit('navigate', { name: 'chat', id: 0 });
        })
        .catch((error) => toast(error.message, true));
    } else if (act === 'scan-cancel') {
      emit('navigate', { name: 'chat', id: 0 });
    }
  });
}
