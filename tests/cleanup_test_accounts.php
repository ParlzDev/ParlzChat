<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$ids = array_values(array_filter(array_map('intval', array_slice($argv, 1))));
if ($ids === []) {
    fwrite(STDERR, '用法: php tests/cleanup_test_accounts.php <user_id> [user_id...]' . PHP_EOL);
    exit(2);
}

$pdo = db();
$ph = implode(',', array_fill(0, count($ids), '?'));

$files = [];

$stmt = $pdo->prepare("SELECT kind, body FROM messages WHERE user_id IN ($ph)");
$stmt->execute($ids);
foreach ($stmt->fetchAll() as $row) {
    $kind = (string)$row['kind'];
    $body = (string)$row['body'];
    if ($kind === 'image' || $kind === 'csticker') {
        $files[] = $body;
    } elseif ($kind === 'file' || $kind === 'voice') {
        $decoded = json_decode($body, true);
        if (is_array($decoded) && isset($decoded['file'])) {
            $files[] = (string)$decoded['file'];
        }
    } elseif ($kind === 'merged') {
        $decoded = json_decode($body, true);
        foreach (is_array($decoded) ? $decoded : [] as $item) {
            if (is_array($item) && isset($item['file'])) {
                $files[] = (string)$item['file'];
            }
        }
    }
}

$stmt = $pdo->prepare("SELECT file FROM user_stickers WHERE user_id IN ($ph)");
$stmt->execute($ids);
foreach ($stmt->fetchAll() as $row) {
    $files[] = (string)$row['file'];
}

$stmt = $pdo->prepare("SELECT kind, body FROM favorites WHERE user_id IN ($ph)");
$stmt->execute($ids);
foreach ($stmt->fetchAll() as $row) {
    $kind = (string)$row['kind'];
    $body = (string)$row['body'];
    if ($kind === 'image' || $kind === 'csticker') {
        $files[] = $body;
    } elseif ($kind === 'file' || $kind === 'voice') {
        $decoded = json_decode($body, true);
        if (is_array($decoded) && isset($decoded['file'])) {
            $files[] = (string)$decoded['file'];
        }
    }
}

$stmt = $pdo->prepare('SELECT id FROM chats WHERE type = \'self\' AND dm_key IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
$stmt->execute(array_map(fn($id) => 'self-' . $id, $ids));
$chats = [];
foreach ($stmt->fetchAll() as $row) {
    $chats[] = (int)$row['id'];
}

$pdo->prepare("DELETE FROM messages WHERE user_id IN ($ph)")->execute($ids);

$pdo->prepare("DELETE FROM chat_members WHERE user_id IN ($ph)")->execute($ids);

foreach ($chats as $chatId) {
    $pdo->prepare('DELETE FROM messages WHERE chat_id = ?')->execute([$chatId]);
    $pdo->prepare('DELETE FROM chat_members WHERE chat_id = ?')->execute([$chatId]);
    $pdo->prepare('DELETE FROM presence WHERE chat_id = ?')->execute([$chatId]);
    $pdo->prepare('DELETE FROM group_invites WHERE chat_id = ?')->execute([$chatId]);
    $pdo->prepare('DELETE FROM chats WHERE id = ?')->execute([$chatId]);
}

$pdo->exec('DELETE FROM chats WHERE is_default = 0 AND (
    (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = chats.id) = 0
    OR (chats.type = \'dm\' AND (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = chats.id) < 2)
)');

$pdo->prepare("DELETE FROM friends WHERE user_id IN ($ph) OR friend_id IN ($ph)")->execute(array_merge($ids, $ids));
$pdo->prepare("DELETE FROM group_invites WHERE inviter_id IN ($ph) OR invitee_id IN ($ph)")->execute(array_merge($ids, $ids));
$pdo->prepare("DELETE FROM devices WHERE user_id IN ($ph)")->execute($ids);
$pdo->prepare("DELETE FROM presence WHERE user_id IN ($ph)")->execute($ids);
$pdo->prepare("DELETE FROM login_codes WHERE user_id IN ($ph)")->execute($ids);
$pdo->prepare("DELETE FROM user_days WHERE user_id IN ($ph)")->execute($ids);
$pdo->prepare("DELETE FROM face_codes WHERE user_id IN ($ph) OR joined_by IN ($ph)")->execute(array_merge($ids, $ids));
$pdo->prepare("DELETE FROM user_stickers WHERE user_id IN ($ph)")->execute($ids);
$pdo->prepare("DELETE FROM favorites WHERE user_id IN ($ph)")->execute($ids);
$pdo->prepare("DELETE FROM users WHERE id IN ($ph)")->execute($ids);

$removed = 0;
foreach (array_unique($files) as $file) {
    if ($file !== '' && preg_match('/^(m|f)\d{1,12}-[a-f0-9]{16}(\.[a-z0-9]{1,10})?$/', $file) === 1) {
        $path = PARLZ_UPLOAD_DIR . '/' . $file;
        if (is_file($path) && @unlink($path)) {
            $removed++;
        }
    }
}

$prefixes = [];
foreach ($ids as $id) {
    $prefixes[] = 'm' . $id . '-';
    $prefixes[] = 'f' . $id . '-';
    $prefixes[] = 'g' . $id . '-';
}
foreach ([PARLZ_UPLOAD_DIR, PARLZ_AVATAR_DIR] as $dir) {
    foreach (scandir($dir) ?: [] as $entry) {
        foreach ($prefixes as $prefix) {
            if (str_starts_with($entry, $prefix)) {
                $path = $dir . '/' . $entry;
                if (is_file($path) && @unlink($path)) {
                    $removed++;
                }
                break;
            }
        }
    }
}

$left = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
$msgs = (int)$pdo->query('SELECT COUNT(*) FROM messages')->fetchColumn();
$chatCount = (int)$pdo->query('SELECT COUNT(*) FROM chats')->fetchColumn();
echo '已删除测试账号 ' . implode(', ', $ids) . '，清理文件 ' . $removed . ' 个。' . PHP_EOL;
echo '剩余用户 ' . $left . '，剩余消息 ' . $msgs . '，剩余会话 ' . $chatCount . PHP_EOL;
