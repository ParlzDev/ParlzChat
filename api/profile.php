<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/image.php';

$user = require_user();
$uid = (int)$user['id'];
$pdo = db();

function profile_payload(array $user): array
{
    $profile = user_public($user);
    $profile['created_at'] = (int)$user['created_at'];
    $profile['email'] = (string)($user['email'] ?? '');
    $profile['level'] = level_of((int)$user['id']);
    return $profile;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    json_out([
        'ok' => true,
        'user' => profile_payload($user),
        'stats' => user_stats($uid),
        'presence' => presence_status($uid),
        'devices' => user_devices($uid, (string)($_SESSION['device'] ?? '')),
    ]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? 'update');

if ($action === 'email') {
    rate_guard('profile_email', (string)$uid, 10, 3600);
    $email = email_normalize((string)($data['email'] ?? ''));
    $code = (string)preg_replace('/\D/', '', (string)($data['code'] ?? ''));
    if ($email === '') {
        fail('请填写新邮箱');
    }
    if (strlen($code) !== 6) {
        fail('请填写邮件里的 6 位验证码');
    }
    if (email_taken($email)) {
        fail('这个邮箱已经被别的账号用了', 409);
    }
    if (!email_code_check($email, $code, trim((string)($user['email'] ?? '')) === '' ? 'bind' : 'rebind')) {
        fail('验证码不正确或已过期，请重新获取');
    }
    db_write(static function () use ($uid, $email): void {
        db()->prepare('UPDATE users SET email = ? WHERE id = ?')->execute([$email, $uid]);
    });
    $fresh = current_user();
    json_out(['ok' => true, 'user' => $fresh === null ? null : user_public($fresh) + ['email' => $email]]);
}

if ($action === 'device-revoke') {
    $id = int_field($data, 'id', '设备');
    $stmt = $pdo->prepare('SELECT token FROM devices WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $uid]);
    $row = $stmt->fetch();
    if ($row === false) {
        fail('设备不存在', 404);
    }
    $pdo->prepare('DELETE FROM devices WHERE id = ?')->execute([$id]);
    json_out(['ok' => true, 'logged_out' => hash_equals((string)$row['token'], (string)($_SESSION['device'] ?? ''))]);
}

if ($action === 'device-revoke-others') {
    $pdo->prepare('DELETE FROM devices WHERE user_id = ? AND token <> ?')->execute([$uid, (string)($_SESSION['device'] ?? '')]);
    json_out(['ok' => true]);
}

if ($action === 'status') {
    $status = (string)($data['status'] ?? 'online');
    if (!in_array($status, ['online', 'dnd', 'away'], true)) {
        fail('无效的在线状态');
    }
    $reply = mb_substr(trim((string)($data['auto_reply'] ?? '')), 0, 60);
    json_out(['ok' => true, 'presence' => presence_set($uid, $status, $reply)]);
}

if ($action === 'avatar') {
    $file = $_FILES['avatar'] ?? null;
    $tmp = is_array($file) ? (string)($file['tmp_name'] ?? '') : '';
    $info = is_uploaded_file($tmp) ? @getimagesize($tmp) : false;
    if ($info !== false && (int)($info[2] ?? 0) === IMAGETYPE_GIF) {
        if ((int)($file['size'] ?? 0) > 2 * 1024 * 1024) {
            fail('头像不能超过 2MB');
        }
        if (!is_dir(PARLZ_AVATAR_DIR) && !mkdir(PARLZ_AVATAR_DIR, 0775, true) && !is_dir(PARLZ_AVATAR_DIR)) {
            fail('无法创建头像目录 assets/avatars');
        }
        $gifName = 'u' . $uid . '-' . bin2hex(random_bytes(6)) . '.gif';
        if (!move_uploaded_file($tmp, PARLZ_AVATAR_DIR . '/' . $gifName)) {
            fail('头像保存失败，请检查 assets/avatars 目录写入权限');
        }
        $old = (string)$user['avatar'];
        if ($old !== '' && preg_match('/^u' . $uid . '-[a-f0-9]+\.(webp|gif)$/', $old) === 1) {
            @unlink(PARLZ_AVATAR_DIR . '/' . $old);
        }
        $pdo->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$gifName, $uid]);
        json_out(['ok' => true, 'avatar' => $gifName]);
    }

    $image = image_receive('avatar');
    if (!is_dir(PARLZ_AVATAR_DIR) && !mkdir(PARLZ_AVATAR_DIR, 0775, true) && !is_dir(PARLZ_AVATAR_DIR)) {
        fail('无法创建头像目录 assets/avatars');
    }

    $name = 'u' . $uid . '-' . bin2hex(random_bytes(6)) . '.webp';
    $saved = image_save_webp($image, PARLZ_AVATAR_DIR . '/' . $name, 192, 88, true);
    imagedestroy($image);
    if ($saved === false) {
        fail('头像保存失败，请检查 assets/avatars 目录写入权限');
    }

    $old = (string)$user['avatar'];
    if ($old !== '' && preg_match('/^u' . $uid . '-[a-f0-9]+\.(webp|gif)$/', $old) === 1) {
        @unlink(PARLZ_AVATAR_DIR . '/' . $old);
    }

    $pdo->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$name, $uid]);
    json_out(['ok' => true, 'avatar' => $name]);
}

if ($action === 'password') {
    $current = (string)($data['current'] ?? '');
    $fresh = (string)($data['password'] ?? '');
    if ($current === '') {
        fail('请输入当前密码');
    }
    if (mb_strlen($fresh) < 6) {
        fail('新密码至少 6 个字符');
    }
    $stmt = $pdo->prepare('SELECT pass_hash FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $hash = (string)$stmt->fetchColumn();
    if (!password_verify($current, $hash)) {
        fail('当前密码不正确', 403);
    }
    $pdo->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')->execute([password_hash($fresh, PASSWORD_DEFAULT), $uid]);
    json_out(['ok' => true]);
}

if ($action === 'update') {
    $nickname = field($data, 'nickname', PARLZ_NICK_MAX, '昵称');
    $bio = trim((string)($data['bio'] ?? ''));
    if (mb_strlen($bio) > PARLZ_BIO_MAX) {
        fail('个性签名不能超过 ' . PARLZ_BIO_MAX . ' 个字符');
    }
    $pdo->prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?')->execute([$nickname, $bio, $uid]);
    json_out(['ok' => true, 'user' => profile_payload(current_user())]);
}

fail('未知操作');
