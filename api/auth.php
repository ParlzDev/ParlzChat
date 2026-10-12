<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    json_out(['ok' => true, 'user' => current_user()]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'scan-create') {
    db()->exec('DELETE FROM login_codes WHERE created_at < ' . (time() - 600));
    $code = bin2hex(random_bytes(12));
    db()->prepare('INSERT INTO login_codes (code, user_id, status, created_at) VALUES (?, NULL, \'pending\', ?)')->execute([$code, time()]);
    json_out(['ok' => true, 'code' => $code]);
}

if ($action === 'scan-poll') {
    $code = preg_replace('/[^a-f0-9]/', '', strtolower((string)($data['code'] ?? ''))) ?? '';
    $stmt = db()->prepare('SELECT user_id, status, created_at FROM login_codes WHERE code = ?');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    if ($row === false || (int)$row['created_at'] < time() - 300) {
        json_out(['ok' => true, 'status' => 'expired']);
    }
    if ($row['status'] !== 'scanned' || (int)$row['user_id'] <= 0) {
        json_out(['ok' => true, 'status' => 'pending']);
    }
    $loginUid = (int)$row['user_id'];
    db()->prepare('DELETE FROM login_codes WHERE code = ?')->execute([$code]);
    session_regenerate_id(true);
    $_SESSION['uid'] = $loginUid;
    $_SESSION['device'] = device_register($loginUid);
    presence_touch($loginUid, 0, false);
    json_out(['ok' => true, 'status' => 'confirmed', 'user' => current_user()]);
}

if ($action === 'scan-confirm') {
    $confirmUser = current_user();
    if ($confirmUser === null) {
        fail('请先登录再扫码确认', 401);
    }
    $code = preg_replace('/[^a-f0-9]/', '', strtolower((string)($data['code'] ?? ''))) ?? '';
    $stmt = db()->prepare('SELECT 1 FROM login_codes WHERE code = ? AND created_at > ?');
    $stmt->execute([$code, time() - 300]);
    if ($stmt->fetchColumn() === false) {
        fail('二维码已过期，请刷新电脑上的二维码');
    }
    db()->prepare('UPDATE login_codes SET user_id = ?, status = \'scanned\' WHERE code = ?')->execute([(int)$confirmUser['id'], $code]);
    json_out(['ok' => true]);
}

if ($action === 'logout') {
    $token = (string)($_SESSION['device'] ?? '');
    if ($token !== '') {
        db()->prepare('DELETE FROM devices WHERE token = ?')->execute([$token]);
    }
    $_SESSION = [];
    parlz_clear_device_cookie();
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => (bool)$params['secure'],
            'httponly' => (bool)$params['httponly'],
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
    json_out(['ok' => true]);
}

if ($action === 'register') {
    $username = field($data, 'username', 20, '用户名');
    if (preg_match('/^[A-Za-z0-9_]{3,20}$/', $username) !== 1) {
        fail('用户名需为 3-20 位字母、数字或下划线');
    }
    $nickname = field($data, 'nickname', PARLZ_NICK_MAX, '昵称');
    $password = (string)($data['password'] ?? '');
    if (mb_strlen($password) < 6) {
        fail('密码至少 6 个字符');
    }
    if (mb_strlen($password) > 72) {
        fail('密码不能超过 72 个字符');
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetchColumn() !== false) {
        fail('用户名已被占用', 409);
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO users (username, nickname, bio, avatar, pass_hash, created_at) VALUES (?, ?, \'\', \'\', ?, ?)');
        $stmt->execute([$username, $nickname, password_hash($password, PASSWORD_DEFAULT), time()]);
    } catch (PDOException) {
        fail('用户名已被占用', 409);
    }

    $uid = (int)$pdo->lastInsertId();
    join_chat(lobby_chat_id(), $uid);
    presence_touch($uid, 0, false);
    $_SESSION['uid'] = $uid;
    $_SESSION['device'] = device_register($uid);
    json_out(['ok' => true, 'user' => current_user()]);
}

if ($action === 'login') {
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');
    if ($username === '' || $password === '') {
        fail('请输入用户名和密码');
    }

    $stmt = db()->prepare('SELECT id, pass_hash FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    if ($row === false || !password_verify($password, (string)$row['pass_hash'])) {
        fail('用户名或密码不正确', 401);
    }

    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$row['id'];
    $_SESSION['device'] = device_register((int)$row['id']);
    presence_touch((int)$row['id'], 0, false);
    json_out(['ok' => true, 'user' => current_user()]);
}

fail('未知操作');
