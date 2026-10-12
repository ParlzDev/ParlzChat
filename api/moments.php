<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

const MOMENT_IMAGE_MAX = 9;

$user = require_user();
$uid = (int)$user['id'];
$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT p.id, p.user_id, p.body, p.images, p.created_at, u.nickname, u.avatar
         FROM posts p JOIN users u ON u.id = p.user_id
         ORDER BY p.id DESC LIMIT 50'
    );
    $stmt->execute();
    $posts = $stmt->fetchAll();

    $postIds = array_map(static fn($row) => (int)$row['id'], $posts);
    $likes = [];
    $comments = [];
    if ($postIds !== []) {
        $ph = implode(',', array_fill(0, count($postIds), '?'));
        $likeStmt = $pdo->prepare(
            "SELECT pl.post_id, pl.user_id, u.nickname, u.avatar
             FROM post_likes pl JOIN users u ON u.id = pl.user_id
             WHERE pl.post_id IN ($ph) ORDER BY pl.created_at"
        );
        $likeStmt->execute($postIds);
        foreach ($likeStmt->fetchAll() as $row) {
            $likes[(int)$row['post_id']][] = [
                'id' => (int)$row['user_id'],
                'nickname' => (string)$row['nickname'],
                'avatar' => (string)$row['avatar'],
            ];
        }
        $commentStmt = $pdo->prepare(
            "SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.nickname, u.avatar
             FROM post_comments c JOIN users u ON u.id = c.user_id
             WHERE c.post_id IN ($ph) ORDER BY c.id"
        );
        $commentStmt->execute($postIds);
        foreach ($commentStmt->fetchAll() as $row) {
            $comments[(int)$row['post_id']][] = [
                'id' => (int)$row['id'],
                'user' => [
                    'id' => (int)$row['user_id'],
                    'nickname' => (string)$row['nickname'],
                    'avatar' => (string)$row['avatar'],
                ],
                'body' => (string)$row['body'],
                'created_at' => (int)$row['created_at'],
            ];
        }
    }

    $result = [];
    foreach ($posts as $row) {
        $postId = (int)$row['id'];
        $images = json_decode((string)$row['images'], true);
        $images = is_array($images) ? array_values(array_filter($images, static fn($file) =>
            is_string($file)
            && preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $file) === 1
            && is_file(PARLZ_UPLOAD_DIR . '/' . $file))) : [];
        $postLikes = $likes[$postId] ?? [];
        $liked = false;
        foreach ($postLikes as $one) {
            if ($one['id'] === $uid) {
                $liked = true;
                break;
            }
        }
        $result[] = [
            'id' => $postId,
            'user' => [
                'id' => (int)$row['user_id'],
                'nickname' => (string)$row['nickname'],
                'avatar' => (string)$row['avatar'],
            ],
            'body' => (string)$row['body'],
            'images' => $images,
            'created_at' => (int)$row['created_at'],
            'mine' => (int)$row['user_id'] === $uid,
            'liked' => $liked,
            'likes' => $postLikes,
            'comments' => array_slice($comments[$postId] ?? [], -50),
        ];
    }

    json_out(['ok' => true, 'posts' => $result]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'add') {
    $body = trim((string)($data['body'] ?? ''));
    $rawImages = $data['images'] ?? [];
    $images = [];
    if (is_array($rawImages)) {
        foreach ($rawImages as $file) {
            $file = (string)$file;
            if (preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $file) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $file)) {
                fail('图片不存在或格式不正确');
            }
            $images[] = $file;
            if (count($images) >= MOMENT_IMAGE_MAX) {
                break;
            }
        }
    }
    if ($body === '' && $images === []) {
        fail('写点什么或选张图片吧');
    }
    if ($body !== '') {
        $body = mb_substr($body, 0, PARLZ_MSG_MAX);
    }
    $pdo->prepare('INSERT INTO posts (user_id, body, images, created_at) VALUES (?, ?, ?, ?)')
        ->execute([$uid, $body, json_encode($images, JSON_UNESCAPED_SLASHES), time()]);
    json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
}

if ($action === 'like') {
    $id = int_field($data, 'id', '动态');
    $on = !empty($data['on']);
    $stmt = $pdo->prepare('SELECT id FROM posts WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn() === false) {
        fail('这条动态不存在了', 404);
    }
    if ($on) {
        $pdo->prepare('INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)')->execute([$id, $uid, time()]);
    } else {
        $pdo->prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')->execute([$id, $uid]);
    }
    $count = (int)$pdo->query('SELECT COUNT(*) FROM post_likes WHERE post_id = ' . $id)->fetchColumn();
    json_out(['ok' => true, 'liked' => $on, 'count' => $count]);
}

if ($action === 'comment') {
    $id = int_field($data, 'id', '动态');
    $body = mb_substr(trim((string)($data['body'] ?? '')), 0, PARLZ_MSG_MAX);
    if ($body === '') {
        fail('评论不能为空');
    }
    $stmt = $pdo->prepare('SELECT id FROM posts WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn() === false) {
        fail('这条动态不存在了', 404);
    }
    $now = time();
    $pdo->prepare('INSERT INTO post_comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)')
        ->execute([$id, $uid, $body, $now]);
    $commentId = (int)$pdo->lastInsertId();
    json_out([
        'ok' => true,
        'comment' => [
            'id' => $commentId,
            'user' => ['id' => $uid, 'nickname' => (string)$user['nickname'], 'avatar' => (string)$user['avatar']],
            'body' => $body,
            'created_at' => $now,
        ],
    ]);
}

if ($action === 'remove') {
    $id = int_field($data, 'id', '动态');
    $stmt = $pdo->prepare('SELECT id FROM posts WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $uid]);
    if ($stmt->fetchColumn() === false) {
        fail('只能删除自己的动态', 403);
    }
    $pdo->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

fail('未知操作');
