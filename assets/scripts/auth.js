import { $, toast } from './util.js';
import { apiPost } from './api.js';
import { qrMount } from './qr.js';

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
    qrMount(qrHost, 'L:' + scanCode, 340);
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
  $('#reset-form').classList.toggle('is-hidden', name !== 'reset');
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

  const resetForm = $('#reset-form');
  const resetCodeBtn = $('#reset-code-btn');
  resetCodeBtn.addEventListener('click', async () => {
    const email = String(new FormData(resetForm).get('email') ?? '').trim();
    showAuthError($('#reset-error'), '');
    resetCodeBtn.disabled = true;
    try {
      await apiPost('api/email.php', { action: 'send', email, purpose: 'reset' });
      toast('验证码已发到 ' + email);
      codeCountdown(resetCodeBtn, 60);
    } catch (error) {
      resetCodeBtn.disabled = false;
      showAuthError($('#reset-error'), error.message);
    }
  });
  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = resetForm.querySelector('button[type="submit"]');
    const data = new FormData(resetForm);
    button.disabled = true;
    showAuthError($('#reset-error'), '');
    try {
      await apiPost('api/auth.php', {
        action: 'reset',
        email: String(data.get('email') ?? '').trim(),
        code: String(data.get('code') ?? '').trim(),
        password: String(data.get('password') ?? ''),
      });
      toast('密码已重置，请用新密码登录');
      switchTab('login');
    } catch (error) {
      showAuthError($('#reset-error'), error.message);
    } finally {
      button.disabled = false;
    }
  });
  $('#forgot-btn').addEventListener('click', () => switchTab('reset'));
  $('#reset-back').addEventListener('click', () => switchTab('login'));

  const registerForm = $('#register-form');
  const codeBtn = $('#email-code-btn');

  const codeCountdown = (button, seconds) => {
    button.disabled = true;
    let left = seconds;
    button.textContent = left + ' 秒后重发';
    window.clearInterval(Number(button.dataset.timer ?? 0));
    button.dataset.timer = String(window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        button.disabled = false;
        button.textContent = '获取验证码';
        return;
      }
      button.textContent = left + ' 秒后重发';
    }, 1000));
  };

  codeBtn.addEventListener('click', async () => {
    const email = String(new FormData(registerForm).get('email') ?? '').trim();
    const nickname = String(new FormData(registerForm).get('nickname') ?? '').trim();
    showAuthError($('#register-error'), '');
    codeBtn.disabled = true;
    try {
      await apiPost('api/email.php', { action: 'send', email, nickname });
      toast('验证码已发到 ' + email);
      codeCountdown(codeBtn, 60);
    } catch (error) {
      codeBtn.disabled = false;
      showAuthError($('#register-error'), error.message);
    }
  });

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
        email: String(data.get('email') ?? '').trim(),
        code: String(data.get('code') ?? '').trim(),
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
