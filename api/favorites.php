<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $stmt = db()->prepare('SELECT id, kind, body, created_at FROM favorites WHERE user_id = ? ORDER BY id DESC LIMIT 100');
    $stmt->execute([$uid]);
    $favorites = [];
    foreach ($stmt->fetchAll() as $row) {
        $kind = (string)$row['kind'];
        $body = (string)$row['body'];
        if ($kind === 'image' || $kind === 'csticker') {
            if (preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $body) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $body)) {
                continue;
            }
        } elseif ($kind === 'file' || $kind === 'voice') {
            $decoded = json_decode($body, true);
            $fname = is_array($decoded) ? (string)($decoded['file'] ?? '') : '';
            if (preg_match('/^f\d{1,12}-[a-f0-9]{16}(\.[a-z0-9]{1,10})?$/', $fname) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $fname)) {
                continue;
            }
        } else {
            $kind = 'text';
            $body = mb_substr($body, 0, PARLZ_MSG_MAX);
        }
        $favorites[] = [
            'id' => (int)$row['id'],
            'kind' => $kind,
            'body' => $body,
            'created_at' => (int)$row['created_at'],
        ];
    }
    json_out(['ok' => true, 'favorites' => $favorites]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'add') {
    $kind = (string)($data['kind'] ?? 'text');
    $body = trim((string)($data['body'] ?? ''));
    if ($kind === 'image' || $kind === 'csticker') {
        if (preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $body) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $body)) {
            fail('图片不存在或格式不正确');
        }
    } elseif ($kind === 'file' || $kind === 'voice') {
        $decoded = json_decode($body, true);
        $fname = is_array($decoded) ? (string)($decoded['file'] ?? '') : '';
        if (preg_match('/^f\d{1,12}-[a-f0-9]{16}(\.[a-z0-9]{1,10})?$/', $fname) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $fname)) {
            fail('文件不存在或格式不正确');
        }
    } elseif ($kind === 'groupcard') {
        $card = json_decode($body, true);
        $cardName = is_array($card) ? trim((string)($card['name'] ?? '')) : '';
        $kind = 'text';
        $body = '[群名片] ' . ($cardName === '' ? '群聊' : $cardName);
    } else {
        $kind = 'text';
        if ($body === '') {
            fail('没有可收藏的内容');
        }
        $body = mb_substr($body, 0, PARLZ_MSG_MAX);
    }
    db()->prepare('INSERT INTO favorites (user_id, kind, body, created_at) VALUES (?, ?, ?, ?)')->execute([$uid, $kind, $body, time()]);
    json_out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}

if ($action === 'remove') {
    $id = int_field($data, 'id', '收藏');
    db()->prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
    json_out(['ok' => true]);
}

fail('未知操作');
