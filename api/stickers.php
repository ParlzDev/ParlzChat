<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];
$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $stmt = $pdo->prepare('SELECT id, file, created_at FROM user_stickers WHERE user_id = ? ORDER BY id DESC LIMIT 50');
    $stmt->execute([$uid]);
    $stickers = [];
    foreach ($stmt->fetchAll() as $row) {
        $stickers[] = ['id' => (int)$row['id'], 'file' => (string)$row['file'], 'created_at' => (int)$row['created_at']];
    }
    json_out(['ok' => true, 'stickers' => $stickers]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'add') {
    $file = trim((string)($data['file'] ?? ''));
    if (preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $file) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $file)) {
        fail('图片不存在或格式不正确');
    }
    $stmt = $pdo->prepare('SELECT id FROM user_stickers WHERE user_id = ? AND file = ?');
    $stmt->execute([$uid, $file]);
    if ($stmt->fetchColumn() !== false) {
        fail('这个表情已经收藏过啦', 409);
    }
    $count = (int)$pdo->query('SELECT COUNT(*) FROM user_stickers WHERE user_id = ' . $uid)->fetchColumn();
    if ($count >= 50) {
        fail('最多收藏 50 个表情');
    }
    $pdo->prepare('INSERT INTO user_stickers (user_id, file, created_at) VALUES (?, ?, ?)')->execute([$uid, $file, time()]);
    json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId(), 'file' => $file]);
}

if ($action === 'remove') {
    $id = int_field($data, 'id', '表情');
    $pdo->prepare('DELETE FROM user_stickers WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
    json_out(['ok' => true]);
}

fail('未知操作');
