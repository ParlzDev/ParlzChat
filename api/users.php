<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$viewer = require_user();
$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    fail('用户参数无效');
}

$stmt = db()->prepare('SELECT id, username, nickname, bio, avatar, created_at FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if ($row === false) {
    fail('用户不存在', 404);
}

$profile = user_public($row);
$profile['level'] = level_of((int)$row['id']);
$profile['created_at'] = (int)$row['created_at'];
$profile['relation'] = relation_between((int)$viewer['id'], $id);
$profile['stats'] = user_stats($id);

json_out(['ok' => true, 'user' => $profile]);
