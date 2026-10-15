<?php

declare(strict_types=1);

function online_map(): array
{
    static $map = null;

    if ($map !== null) {
        return $map;
    }

    $stmt = db()->prepare('SELECT user_id, status FROM presence WHERE last_seen > ?');
    $stmt->execute([time() - PARLZ_ONLINE_WINDOW]);
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[(int)$row['user_id']] = (string)$row['status'];
    }
    return $map;
}

function presence_status(int $userId): array
{
    $stmt = db()->prepare('SELECT status, auto_reply FROM presence WHERE user_id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if ($row === false) {
        return ['status' => 'online', 'auto_reply' => ''];
    }
    $status = in_array((string)$row['status'], ['online', 'dnd', 'away'], true) ? (string)$row['status'] : 'online';
    return ['status' => $status, 'auto_reply' => (string)$row['auto_reply']];
}

function presence_set(int $userId, string $status, string $autoReply): array
{
    db()->prepare('INSERT INTO presence (user_id, chat_id, typing_until, last_seen, status, auto_reply) VALUES (?, 0, 0, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, auto_reply = excluded.auto_reply')
        ->execute([$userId, time(), $status, $autoReply]);
    return ['status' => $status, 'auto_reply' => $autoReply];
}

function device_label(string $ua): string
{
    $ua = trim($ua);
    if ($ua === '') {
        return '未知设备';
    }

    $device = '';
    $system = '';
    if (preg_match('/iPhone OS (\d+)[._](\d+)(?:[._](\d+))?/', $ua, $m) === 1) {
        $device = 'iPhone';
        $system = 'iOS ' . $m[1] . '.' . $m[2] . (isset($m[3]) && $m[3] !== '' ? '.' . $m[3] : '');
    } elseif (preg_match('/iPad[^)]*OS (\d+)[._](\d+)(?:[._](\d+))?/', $ua, $m) === 1) {
        $device = 'iPad';
        $system = 'iPadOS ' . $m[1] . '.' . $m[2] . (isset($m[3]) && $m[3] !== '' ? '.' . $m[3] : '');
    } elseif (stripos($ua, 'iPhone') !== false) {
        $device = 'iPhone';
        $system = 'iOS';
    } elseif (stripos($ua, 'iPad') !== false) {
        $device = 'iPad';
        $system = 'iPadOS';
    } elseif (preg_match('/Android ([\d.]+)(?:;\s*([^;)]+?)\s*(?:Build|\)))?/', $ua, $m) === 1) {
        $model = isset($m[2]) ? trim($m[2]) : '';
        if ($model === '' || mb_strlen($model) < 2 || in_array(strtolower($model), ['wv', 'mobile', 'en', 'zh'], true)) {
            $model = 'Android';
        }
        $device = mb_substr($model, 0, 24);
        $system = 'Android ' . $m[1];
    } elseif (preg_match('/Windows NT ([\d.]+)/', $ua, $m)) {
        $device = 'Windows';
        $names = ['10.0' => 'Windows 10/11', '6.3' => 'Windows 8.1', '6.2' => 'Windows 8', '6.1' => 'Windows 7'];
        $system = $names[$m[1]] ?? ('Windows NT ' . $m[1]);
    } elseif (preg_match('/Mac OS X (\d+)[._](\d+)/', $ua, $m)) {
        $device = 'Mac';
        $system = 'macOS ' . $m[1] . '.' . $m[2];
    } elseif (stripos($ua, 'Linux') !== false) {
        $device = 'Linux';
    }
    if ($device === '') {
        $device = '未知设备';
    }

    $browser = '';
    if (preg_match('/Edg\/(\d+)/', $ua, $m)) {
        $browser = 'Edge ' . $m[1];
    } elseif (preg_match('/OPR\/(\d+)/', $ua, $m)) {
        $browser = 'Opera ' . $m[1];
    } elseif (preg_match('/(?:CriOS|Chrome)\/(\d+)/', $ua, $m)) {
        $browser = 'Chrome ' . $m[1];
    } elseif (preg_match('/(?:FxiOS|Firefox)\/(\d+)/', $ua, $m)) {
        $browser = 'Firefox ' . $m[1];
    } elseif (preg_match('/Version\/([\d.]+)[^)]*Safari/', $ua, $m)) {
        $browser = 'Safari ' . $m[1];
    } elseif (stripos($ua, 'Safari') !== false) {
        $browser = 'Safari';
    }

    $parts = [];
    if ($system !== '' && stripos($system, $device) === 0) {
        $parts[] = $system;
    } elseif ($system !== '') {
        $parts[] = $device;
        $parts[] = $system;
    } else {
        $parts[] = $device;
    }
    if ($browser !== '') {
        $parts[] = $browser;
    }
    return implode(' · ', $parts);
}

function device_register(int $userId): string
{
    $ua = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400);
    $ip = mb_substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
    $token = '';
    db_write(static function () use ($userId, $ua, $ip, &$token): void {
        $now = time();
        $pdo = db();
        $find = $pdo->prepare('SELECT id, token FROM devices WHERE user_id = ? AND ip = ? AND ua = ? ORDER BY last_seen DESC, id DESC LIMIT 1');
        $find->execute([$userId, $ip, $ua]);
        $row = $find->fetch();
        if ($row !== false && $row !== null) {
            $token = (string)$row['token'];
            $pdo->prepare('UPDATE devices SET last_seen = ? WHERE id = ?')->execute([$now, (int)$row['id']]);
            $pdo->prepare('DELETE FROM devices WHERE user_id = ? AND ip = ? AND ua = ? AND id <> ?')
                ->execute([$userId, $ip, $ua, (int)$row['id']]);
            return;
        }
        $token = bin2hex(random_bytes(16));
        $pdo->prepare('INSERT INTO devices (user_id, token, label, ip, ua, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$userId, $token, device_label($ua), $ip, $ua, $now, $now]);
    });
    db_write(static function () use ($userId): void {
        db()->prepare('DELETE FROM devices WHERE user_id = ? AND id NOT IN (SELECT id FROM devices WHERE user_id = ? ORDER BY last_seen DESC LIMIT 20)')
            ->execute([$userId, $userId]);
    });
    return $token;
}

function device_check(int $userId, string $token): bool
{
    if ($token === '') {
        return false;
    }
    $stmt = db()->prepare('SELECT id, last_seen, ua FROM devices WHERE token = ? AND user_id = ?');
    $stmt->execute([$token, $userId]);
    $row = $stmt->fetch();
    if ($row === false) {
        return false;
    }
    $idle = (int)$row['last_seen'] < time() - 60;
    $legacy = (string)($row['ua'] ?? '') === '';
    if ($idle || $legacy) {
        $ua = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400);
        db()->prepare('UPDATE devices SET last_seen = ?, label = ?, ip = ?, ua = ? WHERE id = ?')
            ->execute([time(), device_label($ua), mb_substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45), $ua, (int)$row['id']]);
    }
    return true;
}

function fts_usable(string $text): bool
{
    $terms = preg_split('/\s+/u', trim($text)) ?: [];
    if ($terms === []) {
        return false;
    }
    foreach ($terms as $term) {
        if (mb_strlen($term) < 3) {
            return false;
        }
    }
    return true;
}

function fts_query(string $text): string
{
    $terms = preg_split('/\s+/u', $text) ?: [];
    $parts = [];
    foreach ($terms as $term) {
        $clean = trim((string)preg_replace('/["*()\-:^]+/u', ' ', $term));
        if ($clean === '') {
            continue;
        }
        $parts[] = '"' . $clean . '"';
    }
    return implode(' ', $parts);
}

function messages_search(int $userId, string $query, int $limit = 60): array
{
    $pdo = db();
    $ids = [];
    foreach (chats_for_user($userId) as $chat) {
        $ids[] = (int)$chat['id'];
    }
    if ($ids === []) {
        return [];
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $columns = 'm.id, m.chat_id, m.user_id, m.kind, m.body, m.created_at, c.type AS chat_type, c.name AS chat_name,
        u.nickname AS sender_nick, u.username AS sender_user,
        (SELECT u2.nickname FROM chat_members cm2 JOIN users u2 ON u2.id = cm2.user_id WHERE cm2.chat_id = c.id AND cm2.user_id <> ? LIMIT 1) AS peer_nick';
    $joins = ' FROM messages m JOIN chats c ON c.id = m.chat_id JOIN users u ON u.id = m.user_id';

    $rows = [];
    if (fts_usable($query)) {
        $match = fts_query($query);
        if ($match !== '') {
            try {
                $stmt = $pdo->prepare('SELECT ' . $columns . ' FROM messages_fts f JOIN messages m ON m.id = f.rowid
                    JOIN chats c ON c.id = m.chat_id JOIN users u ON u.id = m.user_id
                    WHERE messages_fts MATCH ? AND m.chat_id IN (' . $in . ') ORDER BY m.id DESC LIMIT ' . (int)$limit);
                $stmt->execute(array_merge([$userId, $match], $ids));
                $rows = $stmt->fetchAll();
            } catch (Throwable $ftsError) {
                $rows = [];
            }
        }
    }
    if ($rows === []) {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $query) . '%';
        $stmt = $pdo->prepare('SELECT ' . $columns . $joins . ' WHERE m.body LIKE ? ESCAPE \'\\\' AND m.chat_id IN (' . $in . ')
            ORDER BY m.id DESC LIMIT ' . (int)$limit);
        $stmt->execute(array_merge([$userId, $like], $ids));
        $rows = $stmt->fetchAll();
    }

    $results = [];
    foreach ($rows as $row) {
        $isGroup = (string)$row['chat_type'] === 'group';
        $sender = (string)$row['sender_nick'] !== '' ? (string)$row['sender_nick'] : (string)$row['sender_user'];
        $results[] = [
            'id' => (int)$row['id'],
            'chat_id' => (int)$row['chat_id'],
            'kind' => (string)$row['kind'],
            'body' => mb_substr((string)$row['body'], 0, 400),
            'created_at' => (int)$row['created_at'],
            'chat_title' => $isGroup
                ? ((string)$row['chat_name'] !== '' ? (string)$row['chat_name'] : '群聊')
                : ((string)($row['peer_nick'] ?? '') !== '' ? (string)$row['peer_nick'] : (string)$row['chat_name']),
            'is_group' => $isGroup,
            'sender' => $sender,
            'mine' => (int)$row['user_id'] === $userId,
        ];
    }
    return $results;
}

function user_devices(int $userId, string $currentToken): array
{
    $stmt = db()->prepare('SELECT id, token, label, ip, ua, created_at, last_seen FROM devices WHERE user_id = ? ORDER BY last_seen DESC LIMIT 20');
    $stmt->execute([$userId]);
    $devices = [];
    foreach ($stmt->fetchAll() as $row) {
        $devices[] = [
            'id' => (int)$row['id'],
            'label' => (string)$row['label'],
            'ip' => (string)$row['ip'],
            'ua' => (string)($row['ua'] ?? ''),
            'created_at' => (int)$row['created_at'],
            'last_seen' => (int)$row['last_seen'],
            'current' => $currentToken !== '' && hash_equals((string)$row['token'], $currentToken),
        ];
    }
    return $devices;
}

function presence_touch(int $userId, int $chatId, bool $typing): void
{
    $now = time();
    $until = $typing ? $now + PARLZ_TYPING_WINDOW : 0;
    if (!$typing) {
        $stmt = db()->prepare('SELECT chat_id, last_seen FROM presence WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if ($row !== false && (int)$row['chat_id'] === $chatId && $now - (int)$row['last_seen'] < 15) {
            return;
        }
    }
    db_write(static function () use ($userId, $chatId, $until, $now): void {
        db()->prepare('INSERT INTO presence (user_id, chat_id, typing_until, last_seen) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            chat_id = excluded.chat_id,
            last_seen = excluded.last_seen,
            typing_until = CASE WHEN excluded.typing_until > presence.typing_until THEN excluded.typing_until ELSE presence.typing_until END')
            ->execute([$userId, $chatId, $until, $now]);
    });
}

function typing_user_ids(int $chatId, int $userId): array
{
    $stmt = db()->prepare('SELECT user_id FROM presence WHERE chat_id = ? AND user_id <> ? AND typing_until > ?');
    $stmt->execute([$chatId, $userId, time()]);
    $ids = [];
    foreach ($stmt->fetchAll() as $row) {
        $ids[] = (int)$row['user_id'];
    }
    return $ids;
}

function chat_row(int $chatId): ?array
{
    $stmt = db()->prepare('SELECT id, type, name, avatar, dm_key, owner_id, is_default, created_at FROM chats WHERE id = ?');
    $stmt->execute([$chatId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function recalled_ids(int $chatId): array
{
    $stmt = db()->prepare('SELECT id FROM messages WHERE chat_id = ? AND kind = \'recalled\' ORDER BY id DESC LIMIT 200');
    $stmt->execute([$chatId]);
    $ids = [];
    foreach ($stmt->fetchAll() as $row) {
        $ids[] = (int)$row['id'];
    }
    return $ids;
}

function member_chat(int $chatId, int $userId): array
{
    $chat = chat_row($chatId);
    if ($chat === null) {
        fail('会话不存在', 404);
    }
    $stmt = db()->prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?');
    $stmt->execute([$chatId, $userId]);
    if ($stmt->fetchColumn() === false) {
        fail('你不在这个会话中', 403);
    }
    return $chat;
}

function user_uid(int $id): string
{
    return 'U' . str_pad((string)$id, 5, '0', STR_PAD_LEFT);
}

function group_id_from_uid(string $uid): int
{
    if (preg_match('/^[AG]?0*(\d{1,12})$/', strtoupper(trim($uid)), $m) === 1) {
        return (int)$m[1];
    }
    return 0;
}

function group_uid(int $id): string
{
    return 'A' . str_pad((string)$id, 5, '0', STR_PAD_LEFT);
}

function uid_user_id(string $uid): int
{
    if (preg_match('/^U(\d{1,12})$/i', trim($uid), $match) !== 1) {
        return 0;
    }
    return (int)$match[1];
}

function uid_group_id(string $uid): int
{
    if (preg_match('/^A(\d{1,12})$/i', trim($uid), $match) !== 1) {
        return 0;
    }
    return (int)$match[1];
}

function user_public(array $row): array
{
    $online = online_map();
    return [
        'id' => (int)$row['id'],
        'uid' => user_uid((int)$row['id']),
        'username' => $row['username'],
        'nickname' => $row['nickname'],
        'bio' => $row['bio'] ?? '',
        'avatar' => $row['avatar'] ?? '',
        'online' => isset($online[(int)$row['id']]),
        'status' => (string)($online[(int)$row['id']] ?? ''),
    ];
}

function message_payload(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'chat_id' => (int)$row['chat_id'],
        'user_id' => (int)$row['user_id'],
        'body' => $row['body'],
        'kind' => $row['kind'],
        'meta' => (string)($row['meta'] ?? ''),
        'created_at' => (int)$row['created_at'],
        'author' => [
            'id' => (int)$row['user_id'],
            'uid' => user_uid((int)$row['user_id']),
            'nickname' => $row['nickname'],
            'username' => $row['username'],
            'avatar' => $row['avatar'],
            'level' => level_of((int)$row['user_id']),
        ],
    ];
}

function messages_page(int $chatId, int $before, int $limit = 40): array
{
    $sql = 'SELECT m.id, m.chat_id, m.user_id, m.body, m.kind, m.meta, m.created_at,
            COALESCE(NULLIF(cm.nickname, \'\'), u.nickname) AS nickname, u.username, u.avatar
            FROM messages m
            JOIN users u ON u.id = m.user_id
            LEFT JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = m.user_id
            WHERE m.chat_id = ?';
    $params = [$chatId];
    if ($before > 0) {
        $sql .= ' AND m.id < ?';
        $params[] = $before;
    }
    $sql .= ' ORDER BY m.id DESC LIMIT ' . max(1, min(100, $limit));
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return array_map('message_payload', array_reverse($stmt->fetchAll()));
}

function messages_after(int $chatId, int $after, int $limit = 200): array
{
    $stmt = db()->prepare('SELECT m.id, m.chat_id, m.user_id, m.body, m.kind, m.meta, m.created_at,
            COALESCE(NULLIF(cm.nickname, \'\'), u.nickname) AS nickname, u.username, u.avatar
            FROM messages m
            JOIN users u ON u.id = m.user_id
            LEFT JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = m.user_id
            WHERE m.chat_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ' . max(1, min(500, $limit)));
    $stmt->execute([$chatId, $after]);
    return array_map('message_payload', $stmt->fetchAll());
}

function push_message(int $chatId, int $userId, string $body, string $kind = 'text', string $meta = ''): array
{
    if ($kind !== 'system' && $kind !== 'call' && $kind !== 'poke') {
        user_day_bump($userId);
    }
    $pdo = db();
    $stmt = $pdo->prepare('INSERT INTO messages (chat_id, user_id, body, kind, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$chatId, $userId, $body, $kind, $meta, time()]);
    $id = (int)$pdo->lastInsertId();
    $pdo->prepare('UPDATE chat_members SET last_read = ? WHERE chat_id = ? AND user_id = ?')->execute([$id, $chatId, $userId]);
    $stmt = $pdo->prepare('SELECT m.id, m.chat_id, m.user_id, m.body, m.kind, m.meta, m.created_at,
        COALESCE(NULLIF(cm.nickname, \'\'), u.nickname) AS nickname, u.username, u.avatar
        FROM messages m JOIN users u ON u.id = m.user_id
        LEFT JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = m.user_id
        WHERE m.id = ?');
    $stmt->execute([$id]);

    $senderName = '';
    $senderStmt = $pdo->prepare('SELECT nickname FROM users WHERE id = ?');
    $senderStmt->execute([$userId]);
    $senderName = (string)$senderStmt->fetchColumn();
    $chatTitle = '';
    $chatStmt = $pdo->prepare('SELECT type, name FROM chats WHERE id = ?');
    $chatStmt->execute([$chatId]);
    $chatRow = $chatStmt->fetch();
    if ($chatRow !== false && (string)$chatRow['type'] === 'group') {
        $chatTitle = (string)$chatRow['name'];
    }
    push_chat_message($chatId, $userId, $senderName, $chatTitle, push_preview($kind, $body), $kind);

    return message_payload($stmt->fetch());
}

function away_autoreply(int $chatId, int $senderId): void
{
    $chat = chat_row($chatId);
    if ($chat === null || (string)$chat['type'] !== 'dm') {
        return;
    }
    $stmt = db()->prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id <> ? LIMIT 1');
    $stmt->execute([$chatId, $senderId]);
    $other = (int)$stmt->fetchColumn();
    if ($other === 0) {
        return;
    }
    $now = time();
    $stmt = db()->prepare('SELECT status, auto_reply, last_auto, last_seen FROM presence WHERE user_id = ?');
    $stmt->execute([$other]);
    $row = $stmt->fetch();
    if ($row === false || (string)$row['status'] !== 'away') {
        return;
    }
    if ((int)$row['last_seen'] <= $now - PARLZ_ONLINE_WINDOW || (int)$row['last_auto'] > $now - PARLZ_AWAY_COOLDOWN) {
        return;
    }
    $reply = trim((string)$row['auto_reply']);
    if ($reply === '') {
        $reply = PARLZ_AWAY_REPLY;
    }
    db()->prepare('UPDATE presence SET last_auto = ? WHERE user_id = ?')->execute([$now, $other]);
    push_message($chatId, $other, $reply, 'text');
}

function mark_mentions(int $chatId, int $senderId, string $kind, string $body): void
{
    $chat = chat_row($chatId);
    if ($chat === null || $chat['type'] === 'dm' || $chat['type'] === 'self') {
        return;
    }
    $scan = $body;
    if ($kind === 'quote') {
        $decoded = json_decode($body, true);
        $scan = is_array($decoded) ? (string)($decoded['text'] ?? '') : '';
    } elseif ($kind !== 'text') {
        return;
    }
    if (!str_contains($scan, '@')) {
        return;
    }
    $everyone = preg_match('/@所有人(?:\s|$)/u', $scan) === 1;
    $pdo = db();
    $update = $pdo->prepare('UPDATE chat_members SET mentioned = 1 WHERE chat_id = ? AND user_id = ?');
    foreach (group_members($chatId) as $member) {
        $memberId = (int)$member['id'];
        if ($memberId === $senderId) {
            continue;
        }
        $nick = trim((string)$member['nickname']);
        if ($nick === '') {
            continue;
        }
        if ($everyone || preg_match('/@' . preg_quote($nick, '/') . '(?:\s|$)/u', $scan) === 1) {
            $update->execute([$chatId, $memberId]);
        }
    }
}

function self_chat_id(int $userId): int
{
    $key = 'self-' . $userId;
    $stmt = db()->prepare('SELECT id FROM chats WHERE dm_key = ?');
    $stmt->execute([$key]);
    $id = (int)$stmt->fetchColumn();
    if ($id > 0) {
        return $id;
    }
    db()->prepare('INSERT INTO chats (type, name, dm_key, owner_id, is_default, created_at) VALUES (\'self\', ?, ?, NULL, 0, ?)')
        ->execute(['文件传输助手', $key, time()]);
    $id = (int)db()->lastInsertId();
    join_chat($id, $userId);
    return $id;
}

function chats_for_user(int $userId): array
{
    $pdo = db();
    self_chat_id($userId);
    $stmt = $pdo->prepare('SELECT c.id, c.type, c.name, c.avatar, c.owner_id, c.is_default, c.notice, c.created_at, cm.last_read,
            cm.pinned, cm.muted, cm.mentioned, cm.nickname AS my_nick, cm.bg,
            (SELECT id FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_id,
            (SELECT body FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
            (SELECT kind FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_kind,
            (SELECT user_id FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_user_id,
            (SELECT created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at
        FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
        WHERE cm.user_id = ?');
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    if ($rows === []) {
        return [];
    }

    $ids = array_map(static fn(array $row): int => (int)$row['id'], $rows);
    $holes = implode(',', array_fill(0, count($ids), '?'));

    $unreadStmt = $pdo->prepare('SELECT m.chat_id, COUNT(*) AS n FROM messages m
        JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
        WHERE m.user_id <> ? AND m.id > cm.last_read AND m.chat_id IN (' . $holes . ')
        GROUP BY m.chat_id');
    $unreadStmt->execute(array_merge([$userId, $userId], $ids));
    $unread = [];
    foreach ($unreadStmt->fetchAll() as $row) {
        $unread[(int)$row['chat_id']] = (int)$row['n'];
    }

    $countStmt = $pdo->prepare('SELECT chat_id, COUNT(*) AS n FROM chat_members WHERE chat_id IN (' . $holes . ') GROUP BY chat_id');
    $countStmt->execute($ids);
    $counts = [];
    foreach ($countStmt->fetchAll() as $row) {
        $counts[(int)$row['chat_id']] = (int)$row['n'];
    }

    $dmStmt = $pdo->prepare('SELECT cm.chat_id, u.id, u.nickname, u.username, u.avatar, f.remark
        FROM chat_members cm JOIN users u ON u.id = cm.user_id
        LEFT JOIN friends f ON f.user_id = ? AND f.friend_id = u.id
        WHERE cm.chat_id IN (' . $holes . ') AND cm.user_id <> ?');
    $dmStmt->execute(array_merge([$userId], $ids, [$userId]));
    $others = [];
    foreach ($dmStmt->fetchAll() as $row) {
        $others[(int)$row['chat_id']] = $row;
    }

    $authorIds = [];
    foreach ($rows as $row) {
        if ($row['last_user_id'] !== null) {
            $authorIds[(int)$row['last_user_id']] = true;
        }
    }
    $authorNames = [];
    if ($authorIds !== []) {
        $ph = implode(',', array_fill(0, count($authorIds), '?'));
        $authorStmt = $pdo->prepare('SELECT id, nickname FROM users WHERE id IN (' . $ph . ')');
        $authorStmt->execute(array_keys($authorIds));
        foreach ($authorStmt->fetchAll() as $row) {
            $authorNames[(int)$row['id']] = $row['nickname'];
        }
    }

    $online = online_map();
    $meStmt = $pdo->prepare('SELECT nickname, avatar FROM users WHERE id = ?');
    $meStmt->execute([$userId]);
    $me = $meStmt->fetch();
    if ($me === false) {
        $me = ['nickname' => '', 'avatar' => ''];
    }
    $chats = [];
    foreach ($rows as $row) {
        $id = (int)$row['id'];
        $other = $others[$id] ?? null;
        $lastId = $row['last_id'] === null ? 0 : (int)$row['last_id'];
        $lastUserId = $row['last_user_id'] === null ? 0 : (int)$row['last_user_id'];
        $remark = $other === null ? '' : trim((string)($other['remark'] ?? ''));
        $dmName = $other === null ? '私聊' : (string)$other['nickname'];
        $isDm = $row['type'] === 'dm';
        $isSelf = $row['type'] === 'self';
        $chats[] = [
            'id' => $id,
            'uid' => $row['type'] === 'group' ? group_uid($id) : user_uid($isSelf ? $userId : (int)($other['id'] ?? 0)),
            'type' => $row['type'],
            'title' => $isDm ? ($remark !== '' ? $remark : $dmName) : $row['name'],
            'owner_id' => (int)$row['owner_id'],
            'is_default' => (bool)$row['is_default'],
            'notice' => (string)($row['notice'] ?? ''),
            'avatar' => $isSelf ? (string)($me['avatar'] ?? '') : ($isDm ? (string)($other['avatar'] ?? '') : (string)$row['avatar']),
            'avatar_user' => $isSelf ? $userId : ($isDm ? (int)($other['id'] ?? 0) : 0),
            'online' => $isSelf ? isset($online[$userId]) : ($isDm && $other !== null ? isset($online[(int)$other['id']]) : null),
            'status' => $isSelf ? (string)($online[$userId] ?? '') : ($isDm && $other !== null ? (string)($online[(int)$other['id']] ?? '') : ''),
            'members' => $counts[$id] ?? 0,
            'unread' => $unread[$id] ?? 0,
            'pinned' => (int)($row['pinned'] ?? 0) === 1,
            'muted' => (int)($row['muted'] ?? 0) === 1,
            'mentioned' => (int)($row['mentioned'] ?? 0) === 1,
            'bg' => (string)($row['bg'] ?? ''),
            'my_nick' => (string)($row['my_nick'] ?? ''),
            'sort_at' => max((int)$row['created_at'], $row['last_at'] === null ? 0 : (int)$row['last_at']),
            'last' => $lastId === 0 ? null : [
                'id' => $lastId,
                'body' => (string)$row['last_body'],
                'kind' => (string)$row['last_kind'],
                'user_id' => $lastUserId,
                'user_name' => $authorNames[$lastUserId] ?? '',
                'created_at' => (int)$row['last_at'],
            ],
        ];
    }

    usort($chats, static function (array $a, array $b): int {
        if ($a['pinned'] !== $b['pinned']) {
            return $b['pinned'] <=> $a['pinned'];
        }
        return $b['sort_at'] <=> $a['sort_at'];
    });
    foreach ($chats as &$chat) {
        unset($chat['sort_at']);
    }
    unset($chat);
    return $chats;
}

function dm_key_for(int $a, int $b): string
{
    return min($a, $b) . ':' . max($a, $b);
}

function open_dm(int $userId, int $otherId): int
{
    $pdo = db();
    $key = dm_key_for($userId, $otherId);
    $stmt = $pdo->prepare('SELECT id FROM chats WHERE dm_key = ?');
    $stmt->execute([$key]);
    $id = $stmt->fetchColumn();
    if ($id !== false) {
        join_chat((int)$id, $userId);
        return (int)$id;
    }
    $pdo->prepare('INSERT INTO chats (type, name, dm_key, owner_id, created_at) VALUES (\'dm\', \'\', ?, NULL, ?)')
        ->execute([$key, time()]);
    $id = (int)$pdo->lastInsertId();
    join_chat($id, $userId);
    join_chat($id, $otherId);
    return $id;
}

function are_friends(int $a, int $b): bool
{
    $stmt = db()->prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = \'accepted\'');
    $stmt->execute([$a, $b]);
    return $stmt->fetchColumn() !== false;
}

function relation_between(int $viewerId, int $otherId): string
{
    if ($viewerId === $otherId) {
        return 'self';
    }
    if (are_friends($viewerId, $otherId)) {
        return 'friend';
    }
    $stmt = db()->prepare('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?');
    $stmt->execute([$viewerId, $otherId]);
    if ($stmt->fetchColumn() === 'pending') {
        return 'outgoing';
    }
    $stmt->execute([$otherId, $viewerId]);
    if ($stmt->fetchColumn() === 'pending') {
        return 'incoming';
    }
    return 'none';
}

function user_stats(int $userId): array
{
    $pdo = db();
    $friends = $pdo->prepare('SELECT COUNT(*) FROM friends WHERE user_id = ? AND status = \'accepted\'');
    $friends->execute([$userId]);
    $groups = $pdo->prepare('SELECT COUNT(*) FROM chat_members cm JOIN chats c ON c.id = cm.chat_id WHERE cm.user_id = ? AND c.type = \'group\'');
    $groups->execute([$userId]);
    $messages = $pdo->prepare('SELECT COUNT(*) FROM messages WHERE user_id = ?');
    $messages->execute([$userId]);
    return [
        'friends' => (int)$friends->fetchColumn(),
        'groups' => (int)$groups->fetchColumn(),
        'messages' => (int)$messages->fetchColumn(),
    ];
}

function group_members(int $chatId): array
{
    $stmt = db()->prepare('SELECT u.id, u.username, u.nickname, u.bio, u.avatar, cm.joined_at, cm.nickname AS group_nick, cm.role, cm.muted_until
        FROM chat_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.chat_id = ? ORDER BY cm.joined_at ASC, u.id ASC');
    $stmt->execute([$chatId]);
    $members = [];
    foreach ($stmt->fetchAll() as $row) {
        $member = user_public($row);
        $groupNick = trim((string)($row['group_nick'] ?? ''));
        if ($groupNick !== '') {
            $member['nickname'] = $groupNick;
        }
        $member['role'] = (string)($row['role'] ?? 'member');
        $member['muted_until'] = (int)($row['muted_until'] ?? 0);
        $members[] = $member;
    }
    return $members;
}

function member_state(int $chatId, int $userId): ?array
{
    $stmt = db()->prepare('SELECT role, muted_until, nickname FROM chat_members WHERE chat_id = ? AND user_id = ?');
    $stmt->execute([$chatId, $userId]);
    $row = $stmt->fetch();
    if ($row === false) {
        return null;
    }
    return [
        'role' => (string)$row['role'],
        'muted_until' => (int)$row['muted_until'],
        'nickname' => (string)$row['nickname'],
    ];
}

function is_chat_manager(array $chat, int $userId): bool
{
    if ((int)$chat['is_default'] === 1) {
        return true;
    }
    if ((int)$chat['owner_id'] === $userId) {
        return true;
    }
    $state = member_state((int)$chat['id'], $userId);
    return $state !== null && $state['role'] === 'admin';
}

function normalize_quote_body(string $body): ?string
{
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || !is_array($decoded['quote'] ?? null)) {
        return null;
    }
    $text = mb_substr(trim((string)($decoded['text'] ?? '')), 0, PARLZ_MSG_MAX);
    if ($text === '') {
        return null;
    }
    $quote = $decoded['quote'];
    $kind = (string)($quote['kind'] ?? 'text');
    if (!in_array($kind, ['text', 'sticker', 'image', 'merged', 'quote', 'file'], true)) {
        $kind = 'text';
    }
    return (string)json_encode([
        'text' => $text,
        'quote' => [
            'id' => max(0, (int)($quote['id'] ?? 0)),
            'name' => mb_substr(trim((string)($quote['name'] ?? '')), 0, 24),
            'uid' => preg_match('/^U\d{1,12}$/i', (string)($quote['uid'] ?? '')) === 1 ? strtoupper((string)$quote['uid']) : '',
            'kind' => $kind,
            'body' => mb_substr((string)($quote['body'] ?? ''), 0, 300),
        ],
    ], JSON_UNESCAPED_UNICODE);
}

function normalize_merged_item(array $item, int $depth): ?array
{
    $kind = (string)($item['kind'] ?? '');
    $name = mb_substr(trim((string)($item['name'] ?? '')), 0, 24);
    $uid = preg_match('/^U\d{1,12}$/i', (string)($item['uid'] ?? '')) === 1 ? strtoupper((string)$item['uid']) : '';
    $at = (int)($item['at'] ?? 0);
    $body = (string)($item['body'] ?? '');
    $avatar = (string)($item['avatar'] ?? '');
    if (preg_match('/^u\d{1,12}-[a-f0-9]{6,}\.(webp|gif)$/', $avatar) !== 1 || !is_file(PARLZ_AVATAR_DIR . '/' . $avatar)) {
        $avatar = '';
    }

    if ($kind === 'merged') {
        if ($depth >= 3) {
            return null;
        }
        $decoded = json_decode($body, true);
        if (!is_array($decoded) || !is_array($decoded['items'] ?? null)) {
            return null;
        }
        $items = normalize_merged_items($decoded['items'], $depth + 1);
        if ($items === []) {
            return null;
        }
        return [
            'name' => $name,
            'uid' => $uid,
            'avatar' => $avatar,
            'kind' => 'merged',
            'body' => (string)json_encode([
                'title' => mb_substr(trim((string)($decoded['title'] ?? '聊天记录')), 0, 40),
                'items' => $items,
            ], JSON_UNESCAPED_UNICODE),
            'at' => $at,
        ];
    }

    if ($kind === 'quote') {
        $normalized = normalize_quote_body($body);
        if ($normalized === null) {
            return null;
        }
        return ['name' => $name, 'uid' => $uid, 'avatar' => $avatar, 'kind' => 'quote', 'body' => $normalized, 'at' => $at];
    }

    if ($kind === 'groupcard') {
        $card = json_decode($body, true);
        $cardName = is_array($card) ? trim((string)($card['name'] ?? '')) : '';
        return ['name' => $name, 'uid' => $uid, 'avatar' => $avatar, 'kind' => 'text',
            'body' => $cardName === '' ? $body : '[群名片] ' . $cardName, 'at' => $at];
    }

    if (!in_array($kind, ['text', 'sticker', 'image', 'file', 'voice', 'csticker'], true)) {
        $kind = 'text';
    }
    if ($kind === 'image' || $kind === 'csticker') {
        if (preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $body) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $body)) {
            $kind = 'text';
            $body = $kind === 'csticker' ? '[表情]' : '[图片]';
        }
    } elseif ($kind === 'sticker') {
        if (!in_array($body, PARLZ_STICKERS, true)) {
            $kind = 'text';
            $body = '[表情]';
        }
    } elseif ($kind === 'file' || $kind === 'voice') {
        $decodedFile = json_decode($body, true);
        $fname = is_array($decodedFile) ? (string)($decodedFile['file'] ?? '') : '';
        if (preg_match('/^f\d{1,12}-[a-f0-9]{16}(\.[a-z0-9]{1,10})?$/', $fname) !== 1 || !is_file(PARLZ_UPLOAD_DIR . '/' . $fname)) {
            $kind = 'text';
            $body = '[文件]';
        } else {
            $display = mb_substr(trim((string)($decodedFile['name'] ?? '')), 0, 100);
            if ($display === '') {
                $display = $kind === 'voice' ? '语音消息' : '文件';
            }
            $fileBody = [
                'file' => $fname,
                'name' => $display,
                'size' => max(0, (int)filesize(PARLZ_UPLOAD_DIR . '/' . $fname)),
            ];
            if ($kind === 'voice') {
                $fileBody['dur'] = max(1, min(600, (int)($decodedFile['dur'] ?? 1)));
            }
            $body = (string)json_encode($fileBody, JSON_UNESCAPED_UNICODE);
        }
    } else {
        $body = mb_substr($body, 0, 300);
    }

    return ['name' => $name, 'uid' => $uid, 'avatar' => $avatar, 'kind' => $kind, 'body' => $body, 'at' => $at];
}

function normalize_merged_items(array $rawItems, int $depth = 1): array
{
    $items = [];
    foreach (array_slice($rawItems, 0, 30) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $normalized = normalize_merged_item($item, $depth);
        if ($normalized !== null) {
            $items[] = $normalized;
        }
    }
    return $items;
}

function recall_cleanup_file(string $kind, string $body, int $messageId): void
{
    $name = '';
    if ($kind === 'file') {
        $decoded = json_decode($body, true);
        $name = is_array($decoded) ? (string)($decoded['file'] ?? '') : '';
    } elseif ($kind === 'image') {
        $name = $body;
    }
    if ($name === '' || preg_match('/^(m\d+-[a-f0-9]{16}\.(webp|gif)|f\d{1,12}-[a-f0-9]{16}(\.[a-z0-9]{1,10})?)$/', $name) !== 1) {
        return;
    }
    $stmt = db()->prepare('SELECT COUNT(*) FROM messages WHERE id <> ? AND body LIKE ?');
    $stmt->execute([$messageId, '%' . $name . '%']);
    if ((int)$stmt->fetchColumn() > 0) {
        return;
    }
    @unlink(PARLZ_UPLOAD_DIR . '/' . $name);
}

function pending_request_count(int $userId): int
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM friends WHERE friend_id = ? AND status = \'pending\'');
    $stmt->execute([$userId]);
    return (int)$stmt->fetchColumn();
}

function calls_sweep_missed(): void
{
    $now = time();
    $stmt = db()->prepare('SELECT * FROM calls WHERE status = \'ringing\' AND created_at < ?');
    $stmt->execute([$now - 60]);
    $stale = $stmt->fetchAll();
    if ($stale !== []) {
        db()->prepare('UPDATE calls SET status = \'missed\', ended_at = ? WHERE status = \'ringing\' AND created_at < ?')
            ->execute([$now, $now - 60]);
        foreach ($stale as $row) {
            call_record_message($row);
        }
    }
    db()->prepare('DELETE FROM calls WHERE status <> \'ringing\' AND status <> \'active\' AND ended_at <> 0 AND ended_at < ?')
        ->execute([$now - 3600]);
}

function call_record_message(array $row): void
{
    if ((int)($row['record_id'] ?? 0) > 0) {
        return;
    }
    $callerId = (int)$row['caller_id'];
    $calleeId = (int)$row['callee_id'];
    $answered = (int)$row['answered_at'];
    $ended = (int)$row['ended_at'];
    $duration = $answered > 0 && $ended > 0 ? max(0, $ended - $answered) : 0;
    $body = json_encode([
        'kind' => (string)$row['kind'] === 'video' ? 'video' : 'audio',
        'status' => (string)$row['status'],
        'duration' => $duration,
    ], JSON_UNESCAPED_UNICODE);
    $chatId = open_dm($callerId, $calleeId);
    $message = push_message($chatId, $callerId, (string)$body, 'call');
    db()->prepare('UPDATE calls SET record_id = ? WHERE id = ?')
        ->execute([(int)$message['id'], (int)$row['id']]);
}

function call_current_row(int $userId): ?array
{
    calls_sweep_missed();
    $stmt = db()->prepare(
        'SELECT * FROM calls
         WHERE (caller_id = ? OR callee_id = ?)
           AND (status IN (\'ringing\', \'active\') OR ended_at > ?)
         ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([$userId, $userId, time() - 30]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function call_payload(array $row, int $userId, bool $full = false): array
{
    $role = (int)$row['caller_id'] === $userId ? 'caller' : 'callee';
    $peerId = $role === 'caller' ? (int)$row['callee_id'] : (int)$row['caller_id'];
    $stmt = db()->prepare('SELECT id, username, nickname, bio, avatar FROM users WHERE id = ?');
    $stmt->execute([$peerId]);
    $peer = $stmt->fetch();
    $payload = [
        'id' => (int)$row['id'],
        'kind' => (string)$row['kind'],
        'status' => (string)$row['status'],
        'role' => $role,
        'peer' => $peer === false ? null : user_public($peer),
        'created_at' => (int)$row['created_at'],
        'answered_at' => (int)$row['answered_at'],
        'ended_at' => (int)$row['ended_at'],
    ];
    if ($full) {
        $ice = json_decode((string)($role === 'caller' ? $row['ice_callee'] : $row['ice_caller']), true);
        $payload['offer'] = (string)$row['offer'];
        $payload['answer'] = (string)$row['answer'];
        $payload['ice'] = is_array($ice) ? array_values($ice) : [];
    }
    return $payload;
}

function call_active_for(int $userId): ?array
{
    $stmt = db()->prepare('SELECT * FROM calls WHERE (caller_id = ? OR callee_id = ?) AND status IN (\'ringing\', \'active\') ORDER BY id DESC LIMIT 1');
    $stmt->execute([$userId, $userId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function call_by_id(int $callId): ?array
{
    $stmt = db()->prepare('SELECT * FROM calls WHERE id = ?');
    $stmt->execute([$callId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function group_calls_for_user(int $userId): array
{
    $alive = time() - 120;
    $stmt = db()->prepare('SELECT s.chat_id, s.created_at, s.started_by,
            (SELECT COUNT(*) FROM group_call_members m WHERE m.chat_id = s.chat_id AND m.last_seen > ' . $alive . ') AS members
        FROM group_call_states s
        JOIN chat_members cm ON cm.chat_id = s.chat_id AND cm.user_id = ?
        WHERE s.created_at > ' . (time() - 6 * 3600) . '
          AND (SELECT COUNT(*) FROM group_call_members m2 WHERE m2.chat_id = s.chat_id AND m2.last_seen > ' . $alive . ') > 0
        ORDER BY s.chat_id');
    $stmt->execute([$userId]);
    $mine = db()->prepare('SELECT chat_id FROM group_call_members WHERE user_id = ? AND last_seen > ' . $alive);
    $mine->execute([$userId]);
    $joined = array_flip(array_map('intval', $mine->fetchAll(PDO::FETCH_COLUMN)));
    $list = [];
    foreach ($stmt->fetchAll() as $row) {
        $chatId = (int)$row['chat_id'];
        $list[] = [
            'chat_id' => $chatId,
            'since' => (int)$row['created_at'],
            'started_by' => (int)$row['started_by'],
            'members' => (int)$row['members'],
            'in_call' => isset($joined[$chatId]),
        ];
    }
    return $list;
}
