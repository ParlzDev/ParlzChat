<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$data = request_data();
$messageId = (int)($data['message_id'] ?? 0);
if ($messageId <= 0) {
    fail('缺少消息');
}
rate_guard('stt', (string)$user['id'], 20, 60);

$stmt = db()->prepare('SELECT id, chat_id, kind, body FROM messages WHERE id = ?');
$stmt->execute([$messageId]);
$row = $stmt->fetch();
if ($row === false || (string)$row['kind'] !== 'voice') {
    fail('这条不是语音消息');
}
member_chat((int)$row['chat_id'], (int)$user['id']);

$cached = stt_cache_get($messageId);
if ($cached !== null && $cached !== '') {
    json_out(['ok' => true, 'text' => $cached, 'cached' => true]);
}

$path = stt_voice_file((string)$row['body']);
if ($path === null) {
    fail('语音文件不存在');
}
$bytes = (string)@file_get_contents($path);
if ($bytes === '') {
    fail('语音文件读不到');
}
if (strlen($bytes) > PARLZ_STT_MAX_BYTES) {
    fail('这条语音太长了');
}

$text = stt_transcribe($bytes, PARLZ_STT_LANG, basename($path));
if ($text !== '') {
    stt_cache_set($messageId, $text);
}
json_out(['ok' => true, 'text' => $text]);
