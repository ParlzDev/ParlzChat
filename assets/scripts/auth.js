import { $ } from './util.js';
import { apiPost } from './api.js';
import { qrSvg } from './qr.js';

let scanTimer = null;
let scanCode = '';

function stopScanLogin() {
  if (scanTimer !== null) {
    window.clearInterval(scanTimer);
    scanTimer = null;
  }
  scanCode = '';
}

async function startScanLogin() {
  const box = $('#auth-scan');
  const qrHost = $('#auth-scan-qr');
  const status = $('#auth-scan-status');
  if (box === null || qrHost === null) {
    return;
  }
  if (window.matchMedia('(max-width: 900px)').matches) {
    box.classList.add('is-hidden');
    return;
  }
  box.classList.remove('is-hidden');
  stopScanLogin();
  try {
    const res = await apiPost('api/auth.php', { action: 'scan-create' });
    scanCode = String(res.code ?? '');
    const url = window.location.origin + '/index.php?scan=' + scanCode;
    const svg = qrSvg(url);
    qrHost.innerHTML = svg === '' ? '<p class="empty-note">二维码组件加载失败</p>' : svg;
    status.textContent = '等待手机扫码确认…';
  } catch (error) {
    status.textContent = '二维码创建失败，请用账号密码登录';
    return;
  }
  scanTimer = window.setInterval(async () => {
    if (scanCode === '') {
      return;
    }
    try {
      const res = await apiPost('api/auth.php', { action: 'scan-poll', code: scanCode });
      if (res.status === 'confirmed') {
        stopScanLogin();
        window.location.href = 'index.php?chat';
      } else if (res.status === 'expired') {
        startScanLogin();
      }
    } catch (error) {
      return;
    }
  }, 2500);
}

function showAuthError(node, message) {
  if (node) {
    node.textContent = message;
  }
}

function switchTab(name) {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.authTab === name);
  });
  $('#login-form').classList.toggle('is-hidden', name !== 'login');
  $('#register-form').classList.toggle('is-hidden', name !== 'register');
  showAuthError($('#login-error'), '');
  showAuthError($('#register-error'), '');
  if (name === 'login') {
    startScanLogin();
  } else {
    stopScanLogin();
    $('#auth-scan').classList.add('is-hidden');
  }
}

export function initAuth(onSuccess, onTab) {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => onTab(tab.dataset.authTab));
  });

  const loginForm = $('#login-form');
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    const data = new FormData(loginForm);
    button.disabled = true;
    showAuthError($('#login-error'), '');
    try {
      const res = await apiPost('api/auth.php', {
        action: 'login',
        username: String(data.get('username') ?? '').trim(),
        password: String(data.get('password') ?? ''),
      });
      onSuccess(res.user);
    } catch (error) {
      showAuthError($('#login-error'), error.message);
    } finally {
      button.disabled = false;
    }
  });

  const registerForm = $('#register-form');
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = registerForm.querySelector('button[type="submit"]');
    const data = new FormData(registerForm);
    button.disabled = true;
    showAuthError($('#register-error'), '');
    try {
      const res = await apiPost('api/auth.php', {
        action: 'register',
        username: String(data.get('username') ?? '').trim(),
        nickname: String(data.get('nickname') ?? '').trim(),
        password: String(data.get('password') ?? ''),
      });
      onSuccess(res.user);
    } catch (error) {
      showAuthError($('#register-error'), error.message);
    } finally {
      button.disabled = false;
    }
  });
}

export function showAuth(tab = 'login') {
  $('#auth-screen').classList.remove('is-hidden');
  $('#app').classList.add('is-hidden');
  switchTab(tab === 'register' ? 'register' : 'login');
}

export function showApp() {
  stopScanLogin();
  $('#auth-screen').classList.add('is-hidden');
  $('#app').classList.remove('is-hidden');
}

export async function logout() {
  try {
    await apiPost('api/auth.php', { action: 'logout' });
  } finally {
    window.location.reload();
  }
}
