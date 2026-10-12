<?php

declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

$user = current_user();
$scanCode = (string)(preg_replace('/[^a-f0-9]/', '', strtolower((string)($_GET['scan'] ?? ''))) ?? '');
$uidParam = strtoupper(trim((string)($_GET['uid'] ?? '')));

$card = null;
if ($user !== null && $uidParam !== '') {
    if (preg_match('/^A(\d{1,12})$/', $uidParam, $m)) {
        $stmt = db()->prepare('SELECT c.id, c.name, c.avatar, (SELECT COUNT(*) FROM chat_members x WHERE x.chat_id = c.id) AS members FROM chats c WHERE c.id = ? AND c.type = \'group\'');
        $stmt->execute([(int)$m[1]]);
        $row = $stmt->fetch();
        if ($row !== false) {
            $card = ['type' => '群聊', 'name' => (string)$row['name'], 'avatar' => (string)$row['avatar'], 'members' => (int)$row['members']];
        }
    } elseif (preg_match('/^U(\d{1,12})$/', $uidParam, $m)) {
        $stmt = db()->prepare('SELECT id, nickname, avatar FROM users WHERE id = ?');
        $stmt->execute([(int)$m[1]]);
        $row = $stmt->fetch();
        if ($row !== false) {
            $card = ['type' => '用户', 'name' => (string)$row['nickname'], 'avatar' => (string)$row['avatar'], 'members' => 0];
        }
    }
}

$avatarSrc = '';
if ($card !== null && $card['avatar'] !== '' && is_file(PARLZ_AVATAR_DIR . '/' . $card['avatar'])) {
    $avatarSrc = PARLZ_AVATAR_URL . '/' . rawurlencode((string)$card['avatar']);
}
$initial = $card === null ? '' : mb_substr(trim((string)$card['name']), 0, 2);
$chatUrl = $uidParam === '' ? '' : 'index.php?chat&uid=' . $uidParam;
?>
<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>Parlz · 扫一扫</title>
<script src="<?= asset('assets/scripts/theme-boot.js') ?>"></script>
<link rel="stylesheet" href="<?= asset('assets/style/base.css') ?>">
<link rel="stylesheet" href="<?= asset('assets/style/components.css') ?>">
</head>
<body class="embed-page">
<div class="embed-wrap">
<?php if ($user === null): ?>
  <div class="embed-card">
    <h3 class="section-title">请先登录</h3>
    <p class="setting-desc">需要在已登录的手机上打开这个页面</p>
  </div>
<?php elseif ($scanCode !== ''): ?>
  <div class="embed-card">
    <h3 class="section-title">确认在电脑上登录 Parlz？</h3>
    <p class="setting-desc">确认后，显示这张二维码的电脑将登录你的账号</p>
    <div class="form-actions embed-actions">
      <button type="button" class="btn btn-primary" id="scan-ok">确认登录</button>
      <button type="button" class="btn" id="scan-no">取消</button>
    </div>
  </div>
<?php elseif ($card !== null): ?>
  <div class="embed-card">
    <div class="embed-profile">
      <span class="embed-avatar"><?php if ($avatarSrc !== ''): ?><img src="<?= htmlspecialchars($avatarSrc, ENT_QUOTES, 'UTF-8') ?>" alt=""><?php else: ?><?= htmlspecialchars($initial, ENT_QUOTES, 'UTF-8') ?><?php endif; ?></span>
      <div>
        <div class="profile-name"><?= htmlspecialchars((string)$card['name'], ENT_QUOTES, 'UTF-8') ?></div>
        <div class="profile-sub mono"><?= htmlspecialchars($uidParam, ENT_QUOTES, 'UTF-8') ?></div>
        <div class="profile-sub"><?= htmlspecialchars((string)$card['type'], ENT_QUOTES, 'UTF-8') ?><?= $card['members'] > 0 ? ' · ' . (int)$card['members'] . ' 人' : '' ?></div>
      </div>
    </div>
    <div class="form-actions embed-actions">
      <button type="button" class="btn btn-primary" id="card-open">进入会话</button>
      <button type="button" class="btn" id="card-no">取消</button>
    </div>
  </div>
<?php else: ?>
  <div class="embed-card">
    <h3 class="section-title">没有识别到有效内容</h3>
    <p class="setting-desc">请确认二维码来自 Parlz 分享</p>
  </div>
<?php endif; ?>
</div>
<script>
(function () {
  var close = function () {
    try { window.parent.postMessage({ type: 'parlz-embed-close' }, window.location.origin); } catch (error) {}
  };
  var open = function (url) {
    try { window.parent.postMessage({ type: 'parlz-embed-open', url: url }, window.location.origin); } catch (error) {}
  };
  var ok = document.getElementById('scan-ok');
  if (ok) {
    ok.addEventListener('click', function () {
      ok.disabled = true;
      fetch('api/auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'scan-confirm', code: <?= json_encode($scanCode) ?> }),
      }).then(function (response) { return response.json(); }).then(function (data) {
        if (data && data.ok) {
          ok.textContent = '已确认';
          setTimeout(close, 400);
        } else {
          ok.disabled = false;
          ok.textContent = '确认登录';
          alert(data && data.error ? data.error : '确认失败，请重试');
        }
      }).catch(function () {
        ok.disabled = false;
        ok.textContent = '确认登录';
        alert('网络错误，请重试');
      });
    });
  }
  var no = document.getElementById('scan-no');
  if (no) {
    no.addEventListener('click', close);
  }
  var cardOpen = document.getElementById('card-open');
  if (cardOpen) {
    cardOpen.addEventListener('click', function () {
      open(<?= json_encode($chatUrl) ?>);
    });
  }
  var cardNo = document.getElementById('card-no');
  if (cardNo) {
    cardNo.addEventListener('click', close);
  }
})();
</script>
</body>
</html>
