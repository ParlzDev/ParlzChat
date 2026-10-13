<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];
$pdo = db();

function relation_map(int $uid): array
{
    $pdo = db();
    $map = [];
    $stmt = $pdo->prepare('SELECT friend_id, status FROM friends WHERE user_id = ?');
    $stmt->execute([$uid]);
    foreach ($stmt->fetchAll() as $row) {
        $map[(int)$row['friend_id']] = $row['status'] === 'accepted' ? 'friend' : 'outgoing';
    }
    $stmt = $pdo->prepare('SELECT user_id FROM friends WHERE friend_id = ? AND status = \'pending\'');
    $stmt->execute([$uid]);
    foreach ($stmt->fetchAll() as $row) {
        $map[(int)$row['user_id']] = 'incoming';
    }
    return $map;
}

function friend_row_hint(array $row): array
{
    return user_public($row) + ['relation' => $row['relation'] ?? 'friend'];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $q = trim((string)($_GET['q'] ?? ''));

    if ($q !== '') {
        $relations = relation_map($uid);
        $uidTarget = uid_user_id($q);
        if ($uidTarget > 0) {
            $stmt = $pdo->prepare('SELECT id, username, nickname, bio, avatar FROM users WHERE id = ? AND id <> ?');
            $stmt->execute([$uidTarget, $uid]);
            $row = $stmt->fetch();
            $results = [];
            if ($row !== false) {
                $row['relation'] = $relations[(int)$row['id']] ?? 'none';
                $results[] = friend_row_hint($row);
            }
            json_out(['ok' => true, 'results' => $results]);
        }
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $stmt = $pdo->prepare('SELECT id, username, nickname, bio, avatar FROM users
            WHERE id <> ? AND (username LIKE ? ESCAPE \'\\\' OR nickname LIKE ? ESCAPE \'\\\')
            ORDER BY username LIMIT 12');
        $stmt->execute([$uid, $like, $like]);
        $results = [];
        foreach ($stmt->fetchAll() as $row) {
            $row['relation'] = $relations[(int)$row['id']] ?? 'none';
            $results[] = friend_row_hint($row);
        }
        json_out(['ok' => true, 'results' => $results]);
    }

    $stmt = $pdo->prepare('SELECT u.id, u.username, u.nickname, u.bio, u.avatar, f.remark FROM friends f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ? AND f.status = \'accepted\'
        ORDER BY u.nickname ASC, u.id ASC');
    $stmt->execute([$uid]);
    $friends = [];
    foreach ($stmt->fetchAll() as $row) {
        $friend = friend_row_hint($row);
        $friend['remark'] = (string)($row['remark'] ?? '');
        $friends[] = $friend;
    }

    $stmt = $pdo->prepare('SELECT u.id, u.username, u.nickname, u.bio, u.avatar, f.created_at AS requested_at FROM friends f
        JOIN users u ON u.id = f.user_id
        WHERE f.friend_id = ? AND f.status = \'pending\'
        ORDER BY f.created_at ASC, u.id ASC');
    $stmt->execute([$uid]);
    $requests = $stmt->fetchAll();
    foreach ($requests as &$row) {
        $requestedAt = (int)($row['requested_at'] ?? 0);
        $row = friend_row_hint($row);
        $row['relation'] = 'incoming';
        $row['requested_at'] = $requestedAt;
    }
    unset($row);

    $stmt = $pdo->prepare('SELECT u.id, u.username, u.nickname, u.bio, u.avatar FROM friends f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ? AND f.status = \'pending\'
        ORDER BY f.created_at ASC, u.id ASC');
    $stmt->execute([$uid]);
    $outgoing = [];
    foreach ($stmt->fetchAll() as $row) {
        $row['relation'] = 'outgoing';
        $outgoing[] = friend_row_hint($row);
    }

    json_out(['ok' => true, 'friends' => $friends, 'requests' => $requests, 'outgoing' => $outgoing]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'quick-add') {
    rate_guard('quick_add', (string)$uid, 60, 3600);
    $targetId = int_field($data, 'user_id', '用户');
    if ($targetId === $uid) {
        fail('不能加自己');
    }
    $stmt = $pdo->prepare('SELECT id, username, nickname, bio, avatar FROM users WHERE id = ?');
    $stmt->execute([$targetId]);
    $target = $stmt->fetch();
    if ($target === false) {
        fail('用户不存在', 404);
    }
    db_write(static function () use ($pdo, $uid, $targetId): void {
        $pdo->prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, \'accepted\', ?)')
            ->execute([$uid, $targetId, time()]);
        $pdo->prepare('UPDATE friends SET status = \'accepted\' WHERE user_id = ? AND friend_id = ?')->execute([$uid, $targetId]);
        $pdo->prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, \'accepted\', ?)')
            ->execute([$targetId, $uid, time()]);
        $pdo->prepare('UPDATE friends SET status = \'accepted\' WHERE user_id = ? AND friend_id = ?')->execute([$targetId, $uid]);
    });
    json_out(['ok' => true, 'user' => friend_row_hint($target + ['relation' => 'friend'])]);
}

if ($action === 'face-code') {
    rate_guard('face_code', (string)$uid, 20, 600);
    $code = '';
    for ($try = 0; $try < 12; $try += 1) {
        $candidate = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $stmt = $pdo->prepare('SELECT 1 FROM face_codes WHERE code = ? AND created_at > ?');
        $stmt->execute([$candidate, time() - 120]);
        if ($stmt->fetchColumn() === false) {
            $code = $candidate;
            break;
        }
    }
    if ($code === '') {
        fail('生成失败，请重试', 503);
    }
    db_write(static function () use ($pdo, $uid, $code): void {
        $pdo->prepare('DELETE FROM face_codes WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('INSERT INTO face_codes (code, user_id, created_at) VALUES (?, ?, ?)')->execute([$code, $uid, time()]);
    });
    json_out(['ok' => true, 'code' => $code, 'ttl' => 120]);
}

if ($action === 'face-status') {
    $stmt = $pdo->prepare('SELECT joined_by FROM face_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
    $stmt->execute([$uid]);
    $joinedBy = (int)$stmt->fetchColumn();
    if ($joinedBy <= 0) {
        json_out(['ok' => true, 'joined' => null]);
    }
    $stmt = $pdo->prepare('SELECT id, username, nickname, bio, avatar FROM users WHERE id = ?');
    $stmt->execute([$joinedBy]);
    $peer = $stmt->fetch();
    json_out(['ok' => true, 'joined' => $peer === false ? null : friend_row_hint($peer + ['relation' => 'friend'])]);
}

if ($action === 'face-join') {
    rate_guard('face_join', (string)$uid, 30, 600);
    $code = (string)preg_replace('/\D/', '', (string)($data['code'] ?? ''));
    if (strlen($code) !== 4) {
        fail('请输入 4 位数字');
    }
    $stmt = $pdo->prepare('SELECT user_id FROM face_codes WHERE code = ? AND created_at > ?');
    $stmt->execute([$code, time() - 120]);
    $ownerId = (int)$stmt->fetchColumn();
    if ($ownerId <= 0) {
        fail('号码不对或已过期，请让对方重新生成');
    }
    if ($ownerId === $uid) {
        fail('不能加自己');
    }
    $stmt = $pdo->prepare('SELECT id, username, nickname, bio, avatar FROM users WHERE id = ?');
    $stmt->execute([$ownerId]);
    $owner = $stmt->fetch();
    if ($owner === false) {
        fail('用户不存在', 404);
    }
    db_write(static function () use ($pdo, $uid, $ownerId, $code): void {
        $pdo->prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, \'accepted\', ?)')
            ->execute([$uid, $ownerId, time()]);
        $pdo->prepare('UPDATE friends SET status = \'accepted\' WHERE user_id = ? AND friend_id = ?')->execute([$uid, $ownerId]);
        $pdo->prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, \'accepted\', ?)')
            ->execute([$ownerId, $uid, time()]);
        $pdo->prepare('UPDATE friends SET status = \'accepted\' WHERE user_id = ? AND friend_id = ?')->execute([$ownerId, $uid]);
        $pdo->prepare('UPDATE face_codes SET joined_by = ? WHERE code = ?')->execute([$uid, $code]);
    });
    json_out(['ok' => true, 'user' => friend_row_hint($owner + ['relation' => 'friend'])]);
}

$targetId = int_field($data, 'user_id', '用户');

if ($targetId === $uid) {
    fail('不能对自己操作');
}

$stmt = $pdo->prepare('SELECT id, username, nickname, bio, avatar FROM users WHERE id = ?');
$stmt->execute([$targetId]);
$target = $stmt->fetch();
if ($target === false) {
    fail('用户不存在', 404);
}

if ($action === 'request') {
    if (are_friends($uid, $targetId)) {
        fail('你们已经是好友了');
    }
    $stmt = $pdo->prepare('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?');
    $stmt->execute([$targetId, $uid]);
    $reverse = $stmt->fetchColumn();
    if ($reverse === 'pending') {
        $pdo->prepare('UPDATE friends SET status = \'accepted\' WHERE user_id = ? AND friend_id = ?')->execute([$targetId, $uid]);
        $pdo->prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, \'accepted\', ?)')->execute([$uid, $targetId, time()]);
        json_out(['ok' => true, 'accepted' => true, 'user' => friend_row_hint($target + ['relation' => 'friend'])]);
    }
    $pdo->prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, \'pending\', ?)')
        ->execute([$uid, $targetId, time()]);
    json_out(['ok' => true, 'accepted' => false]);
}

if ($action === 'accept') {
    $stmt = $pdo->prepare('UPDATE friends SET status = \'accepted\' WHERE user_id = ? AND friend_id = ? AND status = \'pending\'');
    $stmt->execute([$targetId, $uid]);
    if ($stmt->rowCount() === 0) {
        fail('没有待处理的好友请求', 404);
    }
    $pdo->prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, \'accepted\', ?)')
        ->execute([$uid, $targetId, time()]);
    json_out(['ok' => true, 'user' => friend_row_hint($target + ['relation' => 'friend'])]);
}

if ($action === 'decline') {
    $pdo->prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = \'pending\'')->execute([$targetId, $uid]);
    json_out(['ok' => true]);
}

if ($action === 'remove') {
    $pdo->prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
        ->execute([$uid, $targetId, $targetId, $uid]);
    json_out(['ok' => true]);
}

if ($action === 'remark') {
    if (!are_friends($uid, $targetId)) {
        fail('你们还不是好友', 403);
    }
    $remark = mb_substr(trim((string)($data['remark'] ?? '')), 0, 16);
    $pdo->prepare('UPDATE friends SET remark = ? WHERE user_id = ? AND friend_id = ?')->execute([$remark, $uid, $targetId]);
    json_out(['ok' => true, 'remark' => $remark]);
}

fail('未知操作');
