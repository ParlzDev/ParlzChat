<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];

$since = (int)($_GET['since'] ?? 0);
$wait = (int)($_GET['wait'] ?? 50);
$wait = max(5, min(50, $wait));

ignore_user_abort(false);
set_time_limit($wait + 10);

$deadline = time() + $wait;

$probe = db()->prepare('SELECT MAX(m.id) AS max_id, COUNT(*) AS total FROM messages m
    JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
    WHERE m.id > ? AND m.user_id <> ?');

$result = null;
while (time() < $deadline) {
    $probe->execute([$uid, $since, $uid]);
    $row = $probe->fetch();
    $maxId = $row === false || $row['max_id'] === null ? 0 : (int)$row['max_id'];
    if ($maxId > $since) {
        $result = ['ok' => true, 'id' => $maxId, 'count' => (int)$row['total'], 'preview' => null];
        foreach (chats_for_user($uid) as $chat) {
            $last = $chat['last'] ?? null;
            if ($last === null || (int)$last['id'] !== $maxId || (int)$last['user_id'] === $uid) {
                continue;
            }
            $result['preview'] = [
                'chat_id' => (int)$chat['id'],
                'title' => (string)$chat['title'],
                'sender' => (string)($last['user_name'] ?? ''),
                'body' => push_preview((string)$last['kind'], (string)$last['body']),
            ];
            break;
        }
        break;
    }
    if (connection_aborted() === 1) {
        exit;
    }
    usleep(900000);
}

if ($result === null) {
    $result = ['ok' => true, 'id' => $since, 'count' => 0, 'idle' => true];
}

$unread = db()->prepare('SELECT COUNT(*) FROM messages m JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ? WHERE m.user_id <> ? AND m.id > cm.last_read');
$unread->execute([$uid, $uid]);
$result['unread'] = (int)$unread->fetchColumn();

json_out($result);
