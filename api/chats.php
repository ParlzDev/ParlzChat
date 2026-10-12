<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    json_out(['ok' => true, 'chats' => chats_for_user($uid)]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'open') {
    $otherId = int_field($data, 'user_id', '用户');
    if ($otherId === $uid) {
        fail('不能和自己私聊');
    }
    if (!are_friends($uid, $otherId)) {
        fail('你们还不是好友，先去通讯录添加对方', 403);
    }
    $chatId = open_dm($uid, $otherId);
    json_out(['ok' => true, 'chat_id' => $chatId]);
}

if ($action === 'read') {
    $chatId = int_field($data, 'chat_id', '会话');
    member_chat($chatId, $uid);
    $lastId = (int)($data['last_id'] ?? 0);
    db()->prepare('UPDATE chat_members SET last_read = MAX(last_read, ?), mentioned = 0 WHERE chat_id = ? AND user_id = ?')
        ->execute([max(0, $lastId), $chatId, $uid]);
    json_out(['ok' => true]);
}

if ($action === 'pin') {
    $chatId = int_field($data, 'chat_id', '会话');
    member_chat($chatId, $uid);
    $stmt = db()->prepare('SELECT pinned FROM chat_members WHERE chat_id = ? AND user_id = ?');
    $stmt->execute([$chatId, $uid]);
    $pinned = (int)$stmt->fetchColumn() === 1 ? 0 : 1;
    db()->prepare('UPDATE chat_members SET pinned = ? WHERE chat_id = ? AND user_id = ?')->execute([$pinned, $chatId, $uid]);
    json_out(['ok' => true, 'pinned' => $pinned === 1]);
}

if ($action === 'mute') {
    $chatId = int_field($data, 'chat_id', '会话');
    member_chat($chatId, $uid);
    $stmt = db()->prepare('SELECT muted FROM chat_members WHERE chat_id = ? AND user_id = ?');
    $stmt->execute([$chatId, $uid]);
    $muted = (int)$stmt->fetchColumn() === 1 ? 0 : 1;
    db()->prepare('UPDATE chat_members SET muted = ? WHERE chat_id = ? AND user_id = ?')->execute([$muted, $chatId, $uid]);
    json_out(['ok' => true, 'muted' => $muted === 1]);
}

if ($action === 'bg') {
    $chatId = int_field($data, 'chat_id', '会话');
    member_chat($chatId, $uid);
    $name = trim((string)($data['file'] ?? ''));
    if ($name !== '' && preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $name) !== 1) {
        fail('背景图格式不正确');
    }
    if ($name !== '' && !is_file(PARLZ_UPLOAD_DIR . '/' . $name)) {
        fail('背景图不存在');
    }
    db()->prepare('UPDATE chat_members SET bg = ? WHERE chat_id = ? AND user_id = ?')->execute([$name, $chatId, $uid]);
    json_out(['ok' => true, 'bg' => $name]);
}

fail('未知操作');
