<?php

declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

$routes = ['login', 'register', 'scan', 'chat', 'contact', 'moments', 'setting', 'profile'];
$route = '';
foreach ($routes as $name) {
    if (array_key_exists($name, $_GET)) {
        $route = $name;
        break;
    }
}
if ($route === '') {
    header('Location: index.php?chat');
    exit;
}

$user = current_user();
$isAuthRoute = $route === 'login' || $route === 'register';
if ($user === null && !$isAuthRoute) {
    header('Location: index.php?login');
    exit;
}
if ($user !== null && $isAuthRoute) {
    header('Location: index.php?chat');
    exit;
}

$boot = [
    'user' => $user,
    'route' => [
        'name' => $route,
        'id' => (int)($_GET['id'] ?? 0),
        'uid' => (string)($_GET['uid'] ?? ''),
        'scan' => $route === 'scan' ? (string)($_GET['scan'] ?? '') : '',
    ],
    'messageMax' => PARLZ_MSG_MAX,
    'nickMax' => PARLZ_NICK_MAX,
    'bioMax' => PARLZ_BIO_MAX,
    'awayReply' => PARLZ_AWAY_REPLY,
    'fileMax' => PARLZ_FILE_MAX_BYTES,
    'name' => PARLZ_NAME,
    'build' => date('m-d H:i', parlz_build_time()),
    'turn' => PARLZ_TURN_HOST === '' ? null : [
        'host' => PARLZ_TURN_HOST,
        'port' => PARLZ_TURN_PORT,
        'user' => PARLZ_TURN_USER,
        'pass' => PARLZ_TURN_PASS,
        'tls' => PARLZ_TURN_TLS,
        'transport' => PARLZ_TURN_TRANSPORT,
    ],
];
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Parlz · 聊天</title>
<link rel="icon" type="image/svg+xml" href="<?= asset('assets/img/favicon.svg') ?>">
<script src="<?= asset('assets/scripts/theme-boot.js') ?>"></script>
<link rel="stylesheet" href="<?= asset('assets/style/base.css') ?>">
<link rel="stylesheet" href="<?= asset('assets/style/auth.css') ?>">
<link rel="stylesheet" href="<?= asset('assets/style/layout.css') ?>">
<link rel="stylesheet" href="<?= asset('assets/style/components.css') ?>">
<link rel="stylesheet" href="<?= asset('assets/style/record.css') ?>">
<script>window.PARLZ_BOOT=<?= json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
</head>
<body>
<div class="auth-screen is-hidden" id="auth-screen">
  <aside class="auth-brand">
    <img class="auth-logo" src="<?= asset('assets/img/logo.svg') ?>" alt="Parlz">
    <p class="auth-tagline">亮绿主题的纯色聊天室</p>
    <ul class="auth-points">
      <li>私聊 / 群组 / 通讯录</li>
      <li>在线状态与正在输入</li>
      <li>自绘 SVG 表情</li>
    </ul>
  </aside>
  <section class="auth-panel">
    <div class="auth-tabs">
      <button class="auth-tab" type="button" data-auth-tab="login">登录</button>
      <button class="auth-tab" type="button" data-auth-tab="register">注册</button>
    </div>
    <form class="auth-form" id="login-form" autocomplete="on">
      <label class="field">
        <span class="field-label">用户名</span>
        <input class="input" name="username" autocomplete="username" maxlength="20" placeholder="例如 parlz_fan">
      </label>
      <label class="field">
        <span class="field-label">密码</span>
        <input class="input" name="password" type="password" autocomplete="current-password" placeholder="至少 6 位">
      </label>
      <p class="form-error" id="login-error"></p>
      <button class="btn btn-primary btn-block" type="submit">进入 Parlz</button>
      <div class="auth-scan is-hidden" id="auth-scan">
        <div class="auth-scan-qr" id="auth-scan-qr"></div>
        <p class="auth-scan-hint">用已登录 Parlz 的手机扫码，确认后自动登录</p>
        <p class="auth-scan-status" id="auth-scan-status">二维码加载中…</p>
      </div>
    </form>
    <form class="auth-form is-hidden" id="register-form" autocomplete="on">
      <label class="field">
        <span class="field-label">用户名</span>
        <input class="input" name="username" autocomplete="username" maxlength="20" placeholder="3-20 位字母、数字或下划线">
      </label>
      <label class="field">
        <span class="field-label">昵称</span>
        <input class="input" name="nickname" maxlength="24" placeholder="别人看到的名字">
      </label>
      <label class="field">
        <span class="field-label">密码</span>
        <input class="input" name="password" type="password" autocomplete="new-password" placeholder="至少 6 位">
      </label>
      <p class="form-error" id="register-error"></p>
      <button class="btn btn-primary btn-block" type="submit">创建账号</button>
    </form>
  </section>
</div>

<div class="app is-hidden" id="app">
  <nav class="rail">
    <button class="rail-avatar avatar" id="rail-avatar" type="button" title="我的资料"></button>
    <span class="rail-sep"></span>
    <div class="rail-tabs">
      <button class="rail-tab" type="button" data-view="chat">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"/></svg>
        <span class="rail-label">聊天</span>
        <span class="badge is-hidden" id="badge-chats"></span>
      </button>
      <button class="rail-tab" type="button" data-view="contact">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0z"/></svg>
        <span class="rail-label">通讯录</span>
        <span class="badge is-hidden" id="badge-contacts"></span>
      </button>
      <button class="rail-tab" type="button" data-view="moments">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"/><path d="M12 4.2c4.3 0 7.8 3 7.8 6.8s-3.5 6.8-7.8 6.8-7.8-3-7.8-6.8 3.5-6.8 7.8-6.8z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.6" cy="9.4" r="1.5"/><circle cx="12.4" cy="8" r="1.5"/><circle cx="15.6" cy="10.6" r="1.5"/><circle cx="14" cy="14.4" r="1.5"/><circle cx="9.6" cy="14" r="1.5"/></svg>
        <span class="rail-label">动态</span>
      </button>
      <button class="rail-tab" type="button" data-view="setting">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 2h2.8l.5 2.4 1.9.8 2.1-1.2 2 2-1.2 2.1.8 1.9 2.4.5v2.8l-2.4.5-.8 1.9 1.2 2.1-2 2-2.1-1.2-1.9.8-.5 2.4h-2.8l-.5-2.4-1.9-.8-2.1 1.2-2-2 1.2-2.1-.8-1.9L2 13.4v-2.8l2.4-.5.8-1.9L4 6.1l2-2 2.1 1.2 1.9-.8z"/><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm0 2a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z"/></svg>
        <span class="rail-label">设置</span>
      </button>
    </div>
    <button class="rail-logout" id="logout-btn" type="button" title="退出登录">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5v-2H7V6h3zM14 7l5 5-5 5-1-1 3-3h-8v-2h8l-3-3z"/></svg>
    </button>
  </nav>

  <section class="panel">
    <header class="panel-head">
      <h1 class="panel-title" id="panel-title">聊天</h1>
      <div class="panel-actions" id="panel-actions"></div>
    </header>
    <div class="panel-search" id="panel-search-wrap">
      <span class="search-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>
      </span>
      <input class="input search-input" id="panel-search" placeholder="搜索" autocomplete="off">
    </div>
    <div class="panel-body" id="panel-body"></div>
  </section>

  <section class="chat" id="chat">
    <div class="chat-view" id="chat-view">
      <header class="chat-head is-hidden" id="chat-head">
        <button class="icon-btn chat-back" id="chat-back" type="button" title="返回">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6 1.5-1.5L11 12l4.5-4.5z"/></svg>
        </button>
        <span class="chat-head-avatar" id="chat-head-avatar"></span>
        <div class="chat-head-main">
          <h2 class="chat-title" id="chat-title"></h2>
          <p class="chat-sub" id="chat-sub"></p>
        </div>
        <div class="chat-head-actions" id="chat-head-actions"></div>
      </header>
      <div class="chat-empty" id="chat-empty">
        <span class="chat-empty-mark">Parlz</span>
        <p>选择左侧会话开始聊天</p>
      </div>
      <div class="chat-notice is-hidden" id="chat-notice"></div>
      <div class="chat-body is-hidden" id="chat-body"></div>
      <button type="button" class="to-bottom is-hidden" id="to-bottom" title="回到底部">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16.2L5.8 10l1.4-1.4L12 13.4l4.8-4.8L18.2 10z"/></svg>
        <span class="to-bottom-n is-hidden" id="to-bottom-n"></span>
      </button>
      <div class="select-bar is-hidden" id="select-bar">
        <span class="select-count" id="select-count">已选 0 条</span>
        <span class="form-actions">
          <button class="btn btn-sm btn-icon" id="select-cancel" type="button" title="取消选择" aria-label="取消选择">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4zM17.6 5l1.4 1.4L6.4 19 5 17.6z"/></svg>
          </button>
          <button class="btn btn-sm btn-icon btn-primary" id="select-forward" type="button" title="转发" aria-label="转发">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h11l-4-4 1.4-1.4L18.8 12l-6.4 5.4L11 16l4-4H4z"/></svg>
          </button>
        </span>
      </div>
      <footer class="composer is-hidden" id="composer">
        <div class="quote-bar is-hidden" id="quote-bar"></div>
        <div class="upload-bar is-hidden" id="upload-bar">
          <span class="upload-name" id="upload-name"></span>
          <span class="upload-track"><span class="upload-fill" id="upload-fill"></span></span>
          <span class="upload-pct mono" id="upload-pct">0%</span>
        </div>
        <div class="composer-tools">
          <button class="icon-btn" id="emoji-btn" type="button" title="表情">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-3.5-9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM6.8 13h10.4c-.6 2.3-2.6 4-5.2 4s-4.6-1.7-5.2-4z"/></svg>
          </button>
          <button class="icon-btn" id="mention-btn" type="button" title="提到成员">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.4 12v1.6a2.2 2.2 0 0 0 4.4 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="icon-btn" id="image-btn" type="button" title="发送图片或文件">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.2 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="icon-btn" id="shot-btn" type="button" title="截屏发送">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1.2 2H20v15H4V5h3.8zM12 8.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2zm0 2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"/></svg>
          </button>
          <button class="icon-btn" id="voice-btn" type="button" title="语音消息">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M6.5 12a5.5 5.5 0 0 0 11 0h2a7.5 7.5 0 0 1-6.5 7.4V21h-2v-1.6A7.5 7.5 0 0 1 4.5 12z"/></svg>
          </button>
        </div>
        <input type="file" id="image-input" class="is-hidden">
        <textarea class="composer-input" id="composer-input" rows="1" placeholder="输入消息，Enter 发送 / Shift+Enter 换行 / @ 提到成员 / 可直接粘贴图片"></textarea>
        <button type="button" class="voice-hold is-hidden" id="voice-hold">按住 说话</button>
        <button class="btn btn-primary composer-send" id="send-btn" type="button" title="发送" aria-label="发送">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M21.6 3.1L2.5 10.6c-.9.4-.9 1.6 0 1.9l4.7 1.7 1.7 4.8c.3.9 1.5 1 1.9.2l1.8-3.6 4.6 3.5c.7.5 1.7.1 1.9-.8l3-13.4c.2-.9-.6-1.6-1.5-1.3zM9 13.3l9.3-7.4-6.7 7.9-.4 3.4z"/></svg>
        </button>
        <div class="sticker-panel is-hidden" id="sticker-panel"></div>
        <div class="mention-panel is-hidden" id="mention-panel"></div>
      </footer>
    </div>
    <div class="page-view is-hidden" id="page-view"></div>
  </section>
</div>

<aside class="drawer" id="drawer">
  <header class="drawer-head">
    <h2 class="drawer-title" id="drawer-title"></h2>
    <button class="icon-btn" id="drawer-close" type="button" title="关闭">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4zM17.6 5l1.4 1.4L6.4 19 5 17.6z"/></svg>
    </button>
  </header>
  <div class="drawer-body" id="drawer-body"></div>
</aside>

<div class="modal is-hidden" id="lightbox">
  <div class="modal-card">
    <header class="modal-head">
      <h2 class="modal-title">图片</h2>
      <div class="modal-actions">
        <button class="btn btn-sm btn-icon" id="lightbox-copy" type="button" title="复制图片" aria-label="复制图片">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="13" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 3h9a3 3 0 0 1 3 3v9" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <a class="btn btn-sm btn-icon" id="lightbox-open" href="#" target="_blank" rel="noopener noreferrer" title="在新窗口打开" aria-label="在新窗口打开">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4h7v7h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H13zM5 5h6v2H7v10h10v-4h2v6H5z"/></svg>
        </a>
        <button class="btn btn-sm btn-icon btn-primary" id="lightbox-close" type="button" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4zM17.6 5l1.4 1.4L6.4 19 5 17.6z"/></svg>
        </button>
      </div>
    </header>
    <div class="modal-body"><img id="lightbox-img" alt="图片"></div>
  </div>
</div>

<div class="call-layer is-hidden" id="call-layer">
  <video class="call-remote-video is-hidden" id="call-remote-video" autoplay playsinline></video>
  <audio id="call-remote-audio" autoplay></audio>
  <div class="call-inner" id="call-inner">
    <span class="call-avatar" id="call-avatar"></span>
    <h2 class="call-name" id="call-name"></h2>
    <p class="call-status" id="call-status"></p>
    <video class="call-local-video is-hidden" id="call-local-video" autoplay playsinline muted></video>
    <div class="call-actions" id="call-actions"></div>
  </div>
</div>

<div class="shot-layer is-hidden" id="shot-modal">
  <canvas id="shot-canvas"></canvas>
  <div class="shot-bar">
    <span class="shot-size mono" id="shot-size"></span>
    <button class="btn btn-sm btn-icon" id="shot-cancel" type="button" title="取消截图" aria-label="取消截图">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4zM17.6 5l1.4 1.4L6.4 19 5 17.6z"/></svg>
    </button>
    <button class="btn btn-sm btn-icon btn-primary" id="shot-confirm" type="button" title="截取并发送" aria-label="截取并发送">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M21.6 3.1L2.5 10.6c-.9.4-.9 1.6 0 1.9l4.7 1.7 1.7 4.8c.3.9 1.5 1 1.9.2l1.8-3.6 4.6 3.5c.7.5 1.7.1 1.9-.8l3-13.4c.2-.9-.6-1.6-1.5-1.3zM9 13.3l9.3-7.4-6.7 7.9-.4 3.4z"/></svg>
    </button>
  </div>
</div>

<div class="toast-wrap" id="toast-wrap"></div>

<script src="<?= asset('assets/scripts/vendor/qrcode-generator.js') ?>"></script>
<script src="<?= asset('assets/scripts/vendor/jsqr.js') ?>"></script>
<script type="module" src="<?= asset('assets/scripts/app.js') ?>"></script>
</body>
</html>
