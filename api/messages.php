<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $chatId = (int)($_GET['chat_id'] ?? 0);
    member_chat($chatId, $uid);
    $before = (int)($_GET['before'] ?? 0);
    $rows = messages_page($chatId, $before, 40);
    json_out([
        'ok' => true,
        'chat_id' => $chatId,
        'messages' => $rows,
        'has_more' => $before > 0 ? count($rows) === 40 : true,
        'recalled' => recalled_ids($chatId),
    ]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? 'send');

if ($action === 'poke') {
    $chatId = int_field($data, 'chat_id', '会话');
    $chat = member_chat($chatId, $uid);
    $targetId = int_field($data, 'user_id', '成员');
    if ($targetId === $uid) {
        fail('不能拍自己');
    }
    $targetState = member_state($chatId, $targetId);
    if ($targetState === null) {
        fail('对方不在这个会话里', 404);
    }
    if ($chat['type'] === 'dm' || $chat['type'] === 'self') {
        $pokerNick = (string)$user['nickname'];
        $nameStmt = db()->prepare('SELECT nickname FROM users WHERE id = ?');
        $nameStmt->execute([$targetId]);
        $targetNick = (string)$nameStmt->fetchColumn();
    } else {
        $pokerState = member_state($chatId, $uid);
        $pokerNick = $pokerState !== null && $pokerState['nickname'] !== '' ? $pokerState['nickname'] : (string)$user['nickname'];
        $targetNick = $targetState['nickname'] !== '' ? $targetState['nickname'] : '';
        if ($targetNick === '') {
            $nameStmt = db()->prepare('SELECT nickname FROM users WHERE id = ?');
            $nameStmt->execute([$targetId]);
            $targetNick = (string)$nameStmt->fetchColumn();
        }
    }
    $stmt = db()->prepare('SELECT created_at FROM messages WHERE chat_id = ? AND user_id = ? AND kind = \'poke\' ORDER BY id DESC LIMIT 1');
    $stmt->execute([$chatId, $uid]);
    $lastAt = (int)$stmt->fetchColumn();
    if ($lastAt > time() - 3) {
        fail('拍得太快啦，歇一会儿', 429);
    }
    $message = push_message($chatId, $uid, $pokerNick . ' 拍了拍 ' . $targetNick, 'poke');
    json_out(['ok' => true, 'message' => $message]);
}

if ($action === 'recall') {    $id = int_field($data, 'id', '消息');
    $stmt = db()->prepare('SELECT id, chat_id, user_id, kind, body FROM messages WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row === false) {
        fail('消息不存在', 404);
    }
    member_chat((int)$row['chat_id'], $uid);
    if ((int)$row['user_id'] !== $uid) {
        fail('只能撤回自己的消息', 403);
    }
    db()->prepare('UPDATE messages SET kind = \'recalled\', body = \'\' WHERE id = ?')->execute([$id]);
    recall_cleanup_file((string)$row['kind'], (string)$row['body'], $id);
    json_out(['ok' => true, 'id' => $id, 'chat_id' => (int)$row['chat_id']]);
}

$chatId = int_field($data, 'chat_id', '会话');
member_chat($chatId, $uid);
$muteState = member_state($chatId, $uid);
if ($muteState !== null && $muteState['muted_until'] > time()) {
    $left = max(1, (int)ceil(($muteState['muted_until'] - time()) / 60));
    fail('你已被禁言，约剩 ' . $left . ' 分钟', 403);
}
$kind = (string)($data['kind'] ?? 'text');
if (!in_array($kind, ['text', 'sticker', 'image', 'merged', 'quote', 'file', 'voice', 'csticker'], true)) {
    $kind = 'text';
}
$body = trim((string)($data['body'] ?? ''));
if ($kind === 'sticker') {
    if (!in_array($body, PARLZ_STICKERS, true)) {
        fail('未知的表情');
    }
} elseif ($kind === 'csticker') {
    if (preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $body) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $body)) {
        fail('表情不存在或格式不正确');
    }
} elseif ($kind === 'image') {
    if (preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $body) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $body)) {
        fail('图片不存在或格式不正确');
    }
} elseif ($kind === 'voice') {
    $decoded = json_decode($body, true);
    $fname = is_array($decoded) ? (string)($decoded['file'] ?? '') : '';
    if (preg_match('/^f\d{1,12}-[a-f0-9]{16}\.[a-z0-9]{1,10}$/', $fname) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $fname)) {
        fail('语音不存在或格式不正确');
    }
    $dur = max(1, min(600, (int)($decoded['dur'] ?? 1)));
    $body = (string)json_encode([
        'file' => $fname,
        'name' => '语音消息',
        'size' => max(0, (int)filesize(PARLZ_UPLOAD_DIR . '/' . $fname)),
        'dur' => $dur,
    ], JSON_UNESCAPED_UNICODE);
} elseif ($kind === 'file') {
    $decoded = json_decode($body, true);
    $fname = is_array($decoded) ? (string)($decoded['file'] ?? '') : '';
    if (preg_match('/^f\d{1,12}-[a-f0-9]{16}(\.[a-z0-9]{1,10})?$/', $fname) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $fname)) {
        fail('文件不存在或格式不正确');
    }
    $display = mb_substr(trim((string)($decoded['name'] ?? '')), 0, 100);
    if ($display === '') {
        $display = '文件';
    }
    $body = (string)json_encode([
        'file' => $fname,
        'name' => $display,
        'size' => max(0, (int)filesize(PARLZ_UPLOAD_DIR . '/' . $fname)),
    ], JSON_UNESCAPED_UNICODE);
} elseif ($kind === 'quote') {
    $normalized = normalize_quote_body($body);
    if ($normalized === null) {
        fail('引用格式不正确');
    }
    $body = $normalized;
} elseif ($kind === 'merged') {
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || !is_array($decoded['items'] ?? null) || $decoded['items'] === []) {
        fail('聊天记录格式不正确');
    }
    $items = normalize_merged_items($decoded['items'], 1);
    if ($items === []) {
        fail('聊天记录里没有可转发的消息');
    }
    $body = (string)json_encode([
        'title' => mb_substr(trim((string)($decoded['title'] ?? '聊天记录')), 0, 40),
        'items' => $items,
    ], JSON_UNESCAPED_UNICODE);
    if (strlen($body) > 32768) {
        fail('聊天记录太长，请少选几条');
    }
} else {
    if ($body === '') {
        fail('消息不能为空');
    }
    if (mb_strlen($body) > PARLZ_MSG_MAX) {
        fail('消息不能超过 ' . PARLZ_MSG_MAX . ' 个字符');
    }
}
$message = push_message($chatId, $uid, $body, $kind);
mark_mentions($chatId, $uid, $kind, $body);
away_autoreply($chatId, $uid);
json_out(['ok' => true, 'message' => $message]);
