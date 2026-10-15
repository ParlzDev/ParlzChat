import { state, emit } from './state.js';
import { $, esc, avatarHtml, toast, paintPage, pageView, armConfirm } from './util.js';
import { apiGet, apiPost } from './api.js';
import { icon } from './icons.js';
import * as pz from './pz.js';
import { applyTheme, themePref } from './theme.js';
import { enterSends, setEnterSends } from './composer.js';
import { soundOn, setSound, notifyOn, setNotify, requestNotifyPermission, notifyTarget } from './notify.js';
import { logout } from './auth.js';

let loading = false;
let loaded = false;
let devicesOpen = false;
const DEVICE_PREVIEW = 5;

async function loadProfile() {
  if (loaded || loading) {
    return;
  }
  loading = true;
  try {
    const res = await apiGet('api/profile.php');
    state.user = res.user;
    state.presence = res.presence ?? null;
    state.devices = res.devices ?? [];
    loaded = true;
    emit('profile');
  } catch {
    loading = false;
    return;
  }
  loading = false;
}

async function refreshProfile() {
  const res = await apiGet('api/profile.php');
  state.user = res.user;
  state.presence = res.presence ?? null;
  state.devices = res.devices ?? [];
  render();
}

async function revokeDevice(id) {
  try {
    const res = await apiPost('api/profile.php', { action: 'device-revoke', id });
    if (res.logged_out) {
      toast('当前设备已退出登录');
      logout();
      return;
    }
    toast('已退出该设备');
    await refreshProfile();
  } catch (error) {
    toast(error.message, true);
  }
}

async function savePresence(status, successMessage) {
  const replyNode = $('#away-reply');
  try {
    const res = await apiPost('api/profile.php', {
      action: 'status',
      status,
      auto_reply: replyNode === null ? '' : replyNode.value.trim(),
    });
    state.presence = res.presence;
    render();
    const labels = { online: '在线', dnd: '勿扰', away: '离开' };
    toast(successMessage ?? '状态已设为' + (labels[status] ?? '在线'));
  } catch (error) {
    toast(error.message, true);
  }
}

function joinedText(ts) {
  if (!ts) {
    return '未知';
  }
  const date = new Date(ts * 1000);
  return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日加入';
}

function relText(ts) {
  if (!ts) {
    return '未知';
  }
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) {
    return '刚刚活跃';
  }
  if (diff < 3600) {
    return Math.floor(diff / 60) + ' 分钟前活跃';
  }
  if (diff < 86400) {
    return Math.floor(diff / 3600) + ' 小时前活跃';
  }
  if (diff < 86400 * 7) {
    return Math.floor(diff / 86400) + ' 天前活跃';
  }
  const date = new Date(ts * 1000);
  return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate() + ' 活跃';
}

const NOTIFY_LABELS = { android: "手机状态栏", windows: "系统托盘", linux: "桌面通知", apple: "通知中心", web: "浏览器通知" };

function notifyChannelLabel() {
  return NOTIFY_LABELS[notifyTarget()] ?? "系统通知";
}

function deviceIcon(device) {
  const label = String(device.label ?? '');
  const hint = label === '' ? String(device.ua ?? '') : label;
  return /iphone|ipad|ios|android|mobile|手机|平板/i.test(hint) ? icon('phone') : icon('desktop');
}

function deviceRows(devices) {
  if (devices === null || devices.length === 0) {
    return '<p class="empty-note">暂无登录设备记录</p>';
  }
  return devices.map((device) =>
    '<div class="setting-row device-row">' +
      '<span class="device-icon">' + deviceIcon(device) + '</span>' +
      '<div class="device-main">' +
      '<div class="setting-title">' + esc(device.label || '未知设备') +
      (device.current ? '<span class="pending-tag">当前设备</span>' : '') + '</div>' +
      '<div class="setting-desc device-meta"><span>' + esc(device.ip || '未知地址') + ' · ' + relText(device.last_seen) + '</span>' +
      (device.ua ? '<span class="device-ua mono">' + esc(String(device.ua)) + '</span>' : '') +
      '</div></div>' +
      (device.current ? '' : '<button type="button" class="btn btn-sm" data-act="st-revoke" data-id="' + device.id + '" data-label="退出">退出</button>') +
    '</div>').join('');
}

function body() {
  const user = state.user ?? {};
  const boot = window.PARLZ_BOOT ?? {};
  const nickMax = boot.nickMax ?? 24;
  const bioMax = boot.bioMax ?? 80;
  const theme = themePref();
  const presence = state.presence ?? { status: 'online', auto_reply: '' };
  const status = ['online', 'dnd', 'away'].includes(presence.status) ? presence.status : 'online';
  const enterOn = enterSends();
  const soundPref = soundOn();
  const notifyPref = notifyOn();
  const devices = state.devices ?? [];

  return '<div class="setting-block">' +
      '<h3 class="section-title">我的资料</h3>' +
      '<div class="profile-top">' + avatarHtml(user, 'avatar-lg', true) +
        '<div><div class="profile-name">' + esc(user.nickname ?? '') + '</div>' +
        '<div class="profile-sub mono">@' + esc(user.username ?? '') + '</div>' +
        '<div class="profile-bio">' + esc(user.bio || '还没有个性签名') + '</div>' +
        '<div class="profile-sub">' + joinedText(user.created_at) + '</div></div>' +
      '</div>' +
      '<div class="form-actions setting-actions">' +
        '<button type="button" class="btn btn-sm" data-act="st-avatar">' + icon('image') + ' 更换头像</button>' +
        '<input type="file" id="avatar-input" class="is-hidden" accept="image/png,image/jpeg,image/gif,image/webp">' +
        '<span class="danger-note">支持 JPG / PNG / GIF / WebP，自动裁成方形</span>' +
      '</div>' +
    '</div>' +
    '<form class="setting-block" id="profile-form">' +
      '<h3 class="section-title">编辑资料</h3>' +
      '<div class="setting-fields">' +
        '<label class="field"><span class="field-label">昵称</span>' +
        '<input class="input" name="nickname" maxlength="' + nickMax + '" value="' + esc(user.nickname ?? '') + '"></label>' +
        '<label class="field"><span class="field-label">个性签名</span>' +
        '<input class="input" name="bio" maxlength="' + bioMax + '" value="' + esc(user.bio ?? '') + '"></label>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">保存资料</button></div>' +
      '</div>' +
    '</form>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">外观</h3>' +
      '<div class="setting-row">' +
        '<div><div class="setting-title">主题</div>' +
        '<div class="setting-desc">默认跟随系统；暗色系是深绿灰底，不是纯黑</div></div>' +
        '<div class="segmented" id="theme-seg">' +
          '<button type="button" data-theme-option="system"' + (theme === 'system' ? ' class="is-active"' : '') + '>跟随系统</button>' +
          '<button type="button" data-theme-option="light"' + (theme === 'light' ? ' class="is-active"' : '') + '>淡色</button>' +
          '<button type="button" data-theme-option="dark"' + (theme === 'dark' ? ' class="is-active"' : '') + '>暗色</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">在线状态</h3>' +
      '<div class="setting-row">' +
        '<div><div class="setting-title">我的状态</div>' +
        '<div class="setting-desc">勿扰、离开会显示在状态点上；离开时收到私聊会自动回复</div></div>' +
        '<div class="segmented" id="status-seg">' +
          '<button type="button" data-status-option="online"' + (status === 'online' ? ' class="is-active"' : '') + '>在线</button>' +
          '<button type="button" data-status-option="dnd"' + (status === 'dnd' ? ' class="is-active"' : '') + '>勿扰</button>' +
          '<button type="button" data-status-option="away"' + (status === 'away' ? ' class="is-active"' : '') + '>离开</button>' +
        '</div>' +
      '</div>' +
      '<div class="setting-fields">' +
        '<label class="field"><span class="field-label">离开时的自动回复</span>' +
        '<input class="input" id="away-reply" maxlength="60" value="' + esc(presence.auto_reply ?? '') + '" placeholder="' + esc(boot.awayReply ?? '我现在不在，稍后回复你') + '"></label>' +
        '<div class="form-actions"><button type="button" class="btn btn-sm" id="save-reply">保存自动回复</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">聊天</h3>' +
      '<div class="setting-row">' +
        '<div><div class="setting-title">按回车键发送消息</div>' +
        '<div class="setting-desc">' + (enterOn ? '当前：Enter 发送，Shift+Enter 换行' : '当前：Enter 换行，Ctrl+Enter 发送') + '</div></div>' +
        '<div class="segmented" id="enter-seg">' +
          '<button type="button" data-enter="on"' + (enterOn ? ' class="is-active"' : '') + '>开</button>' +
          '<button type="button" data-enter="off"' + (!enterOn ? ' class="is-active"' : '') + '>关</button>' +
        '</div>' +
      '</div>' +
      '<div class="setting-row">' +
        '<div><div class="setting-title">消息提示音</div>' +
        '<div class="setting-desc">收到新消息时响一声</div></div>' +
        '<div class="segmented" id="sound-seg">' +
          '<button type="button" data-sound="on"' + (soundPref ? ' class="is-active"' : '') + '>开</button>' +
          '<button type="button" data-sound="off"' + (!soundPref ? ' class="is-active"' : '') + '>关</button>' +
        '</div>' +
      '</div>' +
      '<div class="setting-row">' +
        '<div><div class="setting-title">桌面通知</div>' +
        '<div class="setting-desc">窗口在后台时通知到' + esc(notifyChannelLabel()) + '；网页端需浏览器允许</div></div>' +
        '<div class="segmented" id="notify-seg">' +
          '<button type="button" data-notify="on"' + (notifyPref ? ' class="is-active"' : '') + '>开</button>' +
          '<button type="button" data-notify="off"' + (!notifyPref ? ' class="is-active"' : '') + '>关</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">账号</h3>' +
      '<div class="setting-row"><div><div class="setting-title">我的邮箱</div>' +
      '<div class="setting-desc" id="my-email">' + esc((user.email ?? '') === '' ? '还没绑定邮箱' : String(user.email)) + '</div></div>' +
      '<button type="button" class="btn btn-sm" id="open-email">' + (((user.email ?? '') === '') ? '绑定' : '修改') + '</button></div>' +
      '<div class="setting-row"><span class="setting-title">我的 UID</span>' +
      '<span class="uid-row"><span class="uid mono">' + esc(user.uid ?? '') + '</span>' +
      '<button type="button" class="btn btn-sm" data-copy="' + esc(user.uid ?? '') + '">复制</button></span></div>' +
      '<div class="setting-row"><span class="setting-title">用户名</span><span class="mono dim">@' + esc(user.username ?? '') + '</span></div>' +
      '<div class="setting-row"><span class="setting-title">注册时间</span><span class="dim">' + joinedText(user.created_at) + '</span></div>' +
      '<div class="setting-row"><span class="setting-title">前端版本</span><span class="mono dim">' + esc(boot.build ?? '') + '</span></div>' +
    '</div>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">登录设备</h3>' +
      deviceRows(devices.length > DEVICE_PREVIEW && !devicesOpen ? devices.slice(0, DEVICE_PREVIEW) : devices) +
      (devices.length > DEVICE_PREVIEW ? '<div class="form-actions setting-actions"><button type="button" class="btn btn-sm" data-act="st-dev-toggle">' + (devicesOpen ? '收起设备列表' : '展开全部 ' + devices.length + ' 台设备') + '</button></div>' : '') +
      (devices.length > 1 ? '<div class="form-actions setting-actions"><button type="button" class="btn btn-sm" data-act="st-revoke-others" data-label="退出其他设备">退出其他设备</button></div>' : '') +
    '</div>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">通话网络自检</h3>' +
      '<div class="setting-row"><div><div class="setting-title">检测本机可用的通话通路</div>' +
      '<div class="setting-desc">host=局域网直连 / srflx=公网映射 / relay=服务器中继；两台设备各测一次，relay 有值就说明中继可用</div></div>' +
      '<button type="button" class="btn btn-sm" id="call-check">开始检测</button></div>' +
      '<div id="call-check-result"></div>' +
    '</div>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">pz: 深链协议</h3>' +
      '<div class="pz-table">' + pz.commandTable().map((row) =>
        '<div class="pz-row"><code class="mono">' + esc(row[0]) + '</code><span>' + esc(row[1]) + '</span></div>').join('') + '</div>' +
      '<div class="setting-row"><div><div class="setting-title">把 pz: 链接关联到 Parlz</div>' +
      '<div class="setting-desc">关联后，在系统里点 pz: 链接会用浏览器打开 Parlz 并执行对应操作；桌面/手机客户端已内置同样的命令</div></div>' +
      '<button type="button" class="btn btn-sm" id="pz-register">关联</button></div>' +
    '</div>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">收藏夹</h3>' +
      '<div class="setting-row"><div><div class="setting-title">我的收藏</div>' +
      '<div class="setting-desc">收藏的文字、图片、文件都在这里</div></div>' +
      '<button type="button" class="btn btn-sm" id="open-favorites">查看</button></div>' +
    '</div>' +
    '<form class="setting-block" id="password-form">' +
      '<h3 class="section-title">安全</h3>' +
      '<div class="setting-fields">' +
        '<label class="field"><span class="field-label">当前密码</span>' +
        '<input class="input" name="current" type="password" autocomplete="current-password"></label>' +
        '<label class="field"><span class="field-label">新密码</span>' +
        '<input class="input" name="password" type="password" autocomplete="new-password" placeholder="至少 6 位"></label>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">更新密码</button></div>' +
      '</div>' +
    '</form>' +
    '<div class="setting-block">' +
      '<h3 class="section-title">会话</h3>' +
      '<div class="form-actions"><button type="button" class="btn" data-act="st-logout">' + icon('logout') + ' 退出登录</button></div>' +
    '</div>';
}

export function render() {
  paintPage('setting', '设置', body());
  wire();
  loadProfile().catch(() => {});
}

function wire() {
  $('#theme-seg').addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-option]');
    if (button === null) {
      return;
    }
    const next = applyTheme(button.dataset.themeOption);
    render();
    const messages = { system: '已跟随系统主题', light: '已切换到淡色系', dark: '已切换到暗色系' };
    toast(messages[next] ?? '主题已更新');
  });

  $('#status-seg').addEventListener('click', (event) => {
    const button = event.target.closest('[data-status-option]');
    if (button === null) {
      return;
    }
    savePresence(button.dataset.statusOption);
  });

  $('#save-reply').addEventListener('click', () => {
    savePresence(state.presence ? state.presence.status : 'online', '自动回复已保存');
  });

  $('#enter-seg').addEventListener('click', (event) => {
    const button = event.target.closest('[data-enter]');
    if (button === null) {
      return;
    }
    const on = button.dataset.enter === 'on';
    setEnterSends(on);
    render();
    toast(on ? '回车发送已开启' : '回车发送已关闭，Ctrl+Enter 发送');
  });

  $('#sound-seg').addEventListener('click', (event) => {
    const button = event.target.closest('[data-sound]');
    if (button === null) {
      return;
    }
    const on = button.dataset.sound === 'on';
    setSound(on);
    render();
    toast(on ? '消息提示音已开启' : '消息提示音已关闭');
  });

  $('#notify-seg').addEventListener('click', (event) => {
    const button = event.target.closest('[data-notify]');
    if (button === null) {
      return;
    }
    if (button.dataset.notify !== 'on') {
      setNotify(false);
      render();
      toast('桌面通知已关闭');
      return;
    }
    requestNotifyPermission().then((permission) => {
      if (permission === 'granted') {
        setNotify(true);
        toast('桌面通知已开启');
      } else {
        setNotify(false);
        toast('浏览器未允许通知，可在站点权限里打开', true);
      }
      render();
    });
  });

  document.querySelectorAll('[data-act="st-revoke"]').forEach((button) => {
    button.addEventListener('click', () => revokeDevice(Number(button.dataset.id)));
  });
  const devToggle = document.querySelector('[data-act="st-dev-toggle"]');
  if (devToggle !== null) {
    devToggle.addEventListener('click', () => {
      devicesOpen = !devicesOpen;
      render();
    });
  }
  const revokeOthers = document.querySelector('[data-act="st-revoke-others"]');
  if (revokeOthers !== null) {
    revokeOthers.addEventListener('click', () => {
      armConfirm(revokeOthers, () => {
        apiPost('api/profile.php', { action: 'device-revoke-others' })
          .then(async () => {
            toast('已退出其他设备');
            await refreshProfile();
          })
          .catch((error) => toast(error.message, true));
      });
    });
  }

  const emailBtn = $('#open-email');
  if (emailBtn !== null) {
    emailBtn.addEventListener('click', () => {
      import('./drawer.js').then(({ open }) => {
        const hasEmail = String(state.user?.email ?? '') !== '';
        const purpose = hasEmail ? 'rebind' : 'bind';
        open(hasEmail ? '换绑邮箱' : '绑定邮箱',
          '<label class="field"><span class="field-label">' + (hasEmail ? '新邮箱' : '要绑定的邮箱') + '</span>' +
          '<input class="input" id="new-email" type="email" maxlength="190" value="' + esc(state.user?.email ?? '') + '" placeholder="' + (hasEmail ? '换成这个邮箱' : '绑定后可以用这个邮箱找回密码') + '"></label>' +
          '<label class="field"><span class="field-label">验证码</span>' +
          '<span class="field-code"><input class="input" id="new-email-code" inputmode="numeric" maxlength="6" placeholder="发到这个邮箱的 6 位数字">' +
          '<button class="btn btn-sm" id="new-email-send" type="button">获取验证码</button></span></label>' +
          '<div class="form-actions drawer-actions"><button class="btn btn-primary" id="new-email-save" type="button">' + (hasEmail ? '保存' : '绑定') + '</button></div>');
        $('#new-email-send').addEventListener('click', () => {
          const email = String($('#new-email').value ?? '').trim();
          apiPost('api/email.php', { action: 'send', email, purpose })
            .then(() => toast('验证码已发到 ' + email))
            .catch((error) => toast(error.message, true));
        });
        $('#new-email-save').addEventListener('click', async () => {
          try {
            const res = await apiPost('api/profile.php', { action: 'email', email: String($('#new-email').value ?? '').trim(), code: String($('#new-email-code').value ?? '').trim() });
            if (state.user !== null && res.user !== null) {
              state.user.email = res.user.email;
            }
            toast(hasEmail ? '邮箱已换绑' : '邮箱已绑定');
            render();
          } catch (error) {
            toast(error.message, true);
          }
        });
      });
    });
  }

  const pzBtn = $('#pz-register');
  if (pzBtn !== null) {
    pzBtn.addEventListener('click', () => {
      const target = window.location.origin + '/index.php?pz=%s';
      if (typeof navigator.registerProtocolHandler !== 'function') {
        toast('这个浏览器不支持协议关联，用客户端打开 pz: 链接即可', true);
        return;
      }
      try {
        navigator.registerProtocolHandler('pz', target, 'Parlz');
        toast('已请求关联 pz: 链接，浏览器会弹确认框');
      } catch (error) {
        toast('关联失败：' + error.message, true);
      }
    });
  }

  const favBtn = $('#open-favorites');
  if (favBtn !== null) {
    favBtn.addEventListener('click', () => {
      import('./drawer.js').then(({ openFavorites }) => openFavorites());    });
  }

  const checkBtn = $('#call-check');
  if (checkBtn !== null) {
    checkBtn.addEventListener('click', async () => {
      const out = $('#call-check-result');
      checkBtn.disabled = true;
      if (out !== null) {
        out.innerHTML = '<p class="empty-note">正在收集候选（约 7 秒）…</p>';
      }
      try {
        const { selfCheck, relayCheck, relayUrls } = await import('./call.js');
        const result = await selfCheck();
        const relay = relayUrls().length > 0 ? await relayCheck(6000) : { ok: false, url: '', errors: ['服务器没下发中继地址'] };
        const total = result.types.host + result.types.srflx + result.types.relay;
        const verdict = relay.ok
          ? '中继可用：即使打不通也能通过服务器转发'
          : relay.url === ''
            ? '服务器没下发中继地址，只能靠 NAT 打洞，严格 NAT 下会连不上'
            : result.types.srflx > 0
              ? '中继不可达（' + relay.url + '），只能靠 NAT 打洞，严格 NAT 下会连不上'
              : '中继不可达（' + relay.url + '）且没有公网地址，跨网络通话必失败';
        if (out !== null) {
          const extra = result.details.concat(relay.errors ?? []);
          out.innerHTML =
            '<div class="setting-row"><span class="check-verdict' + (relay.ok ? '' : ' dim') + '">中继 ' + (relay.ok ? '可用' : '不可达') + '</span>' +
            '<span class="mono">host ' + result.types.host + ' · srflx ' + result.types.srflx + ' · relay ' + result.types.relay + '</span></div>' +
            '<p class="setting-desc">' + esc(total === 0 ? '没有收集到任何候选，检查网络后重试' : verdict) + '</p>' +
            (extra.length === 0 ? '' :
              '<div class="form-actions setting-actions"><button type="button" class="btn btn-sm" data-act="st-check-toggle">查看明细 ' + extra.length + '</button></div>' +
              '<p class="setting-desc check-detail mono" id="call-check-detail" hidden>' + esc(extra.join('　')) + '</p>');
          const toggle = out.querySelector('[data-act="st-check-toggle"]');
          if (toggle !== null) {
            toggle.addEventListener('click', () => {
              const detail = out.querySelector('#call-check-detail');
              if (detail !== null) {
                detail.hidden = !detail.hidden;
                toggle.textContent = detail.hidden ? '查看明细 ' + extra.length : '收起明细';
              }
            });
          }
        }
      } catch (error) {
        if (out !== null) {
          out.innerHTML = '<p class="empty-note">检测失败：' + esc(error.message) + '</p>';
        }
      } finally {
        checkBtn.disabled = false;
      }
    });
  }

  $('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    try {
      const res = await apiPost('api/profile.php', {
        action: 'update',
        nickname: String(data.get('nickname') ?? '').trim(),
        bio: String(data.get('bio') ?? '').trim(),
      });
      state.user = res.user;
      emit('profile');
      toast('资料已保存');
    } catch (error) {
      toast(error.message, true);
    }
  });

  const passwordForm = $('#password-form');
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(passwordForm);
    try {
      await apiPost('api/profile.php', {
        action: 'password',
        current: String(data.get('current') ?? ''),
        password: String(data.get('password') ?? ''),
      });
      passwordForm.reset();
      toast('密码已更新');
    } catch (error) {
      toast(error.message, true);
    }
  });

  const avatarInput = $('#avatar-input');
  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) {
      return;
    }
    const form = new FormData();
    form.append('action', 'avatar');
    form.append('avatar', file);
    try {
      const { uploadFile } = await import('./upload.js');
      const res = await uploadFile('api/profile.php', form, file.name);
      state.user = { ...(state.user ?? {}), avatar: res.avatar };
      emit('profile');
      toast('头像已更新');
    } catch (error) {
      toast(error.message, true);
    } finally {
      avatarInput.value = '';
    }
  });
}

export function init() {
  $('#page-view').addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (target === null || pageView() !== 'setting') {
      return;
    }
    if (target.dataset.act === 'st-logout') {
      logout();
    } else if (target.dataset.act === 'st-avatar') {
      const input = $('#avatar-input');
      if (input) {
        input.click();
      }
    }
  });
}
