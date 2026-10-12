<?php

declare(strict_types=1);

function add_column_if_missing(PDO $pdo, string $table, string $column, string $definition): void
{
    foreach ($pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll() as $info) {
        if ($info['name'] === $column) {
            return;
        }
    }
    $pdo->exec('ALTER TABLE ' . $table . ' ADD COLUMN ' . $column . ' ' . $definition);
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!is_dir(PARLZ_DATA) && !mkdir(PARLZ_DATA, 0775, true) && !is_dir(PARLZ_DATA)) {
        throw new RuntimeException('无法创建数据目录: ' . PARLZ_DATA);
    }

    $pdo = new PDO('sqlite:' . PARLZ_DB, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    migrate($pdo);

    return $pdo;
}

function migrate(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        nickname TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT \'\',
        avatar TEXT NOT NULL DEFAULT \'\',
        pass_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT \'pending\',
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, friend_id)
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT \'\',
        avatar TEXT NOT NULL DEFAULT \'\',
        dm_key TEXT UNIQUE,
        owner_id INTEGER,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )');

    add_column_if_missing($pdo, 'chats', 'avatar', 'TEXT NOT NULL DEFAULT \'\'');
    add_column_if_missing($pdo, 'chats', 'notice', 'TEXT NOT NULL DEFAULT \'\'');

    $pdo->exec('CREATE TABLE IF NOT EXISTS chat_members (
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at INTEGER NOT NULL,
        last_read INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (chat_id, user_id)
    )');

    add_column_if_missing($pdo, 'chat_members', 'nickname', 'TEXT NOT NULL DEFAULT \'\'');
    add_column_if_missing($pdo, 'chat_members', 'role', 'TEXT NOT NULL DEFAULT \'member\'');
    add_column_if_missing($pdo, 'chat_members', 'muted_until', 'INTEGER NOT NULL DEFAULT 0');
    add_column_if_missing($pdo, 'chat_members', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
    add_column_if_missing($pdo, 'chat_members', 'muted', 'INTEGER NOT NULL DEFAULT 0');
    add_column_if_missing($pdo, 'chat_members', 'bg', 'TEXT NOT NULL DEFAULT \'\'');
    add_column_if_missing($pdo, 'chat_members', 'mentioned', 'INTEGER NOT NULL DEFAULT 0');

    $pdo->exec('CREATE TABLE IF NOT EXISTS group_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT \'pending\',
        created_at INTEGER NOT NULL,
        UNIQUE (chat_id, invitee_id)
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS login_codes (
        code TEXT PRIMARY KEY,
        user_id INTEGER,
        status TEXT NOT NULL DEFAULT \'pending\',
        created_at INTEGER NOT NULL
    )');

    add_column_if_missing($pdo, 'friends', 'remark', 'TEXT NOT NULL DEFAULT \'\'');

    $pdo->exec('CREATE TABLE IF NOT EXISTS user_stickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL DEFAULT \'\',
        images TEXT NOT NULL DEFAULT \'[]\',
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS post_likes (
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (post_id, user_id)
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS post_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_posts_id ON posts (id DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments (post_id, id)');

    $pdo->exec('CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        callee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT \'audio\',
        status TEXT NOT NULL DEFAULT \'ringing\',
        offer TEXT NOT NULL DEFAULT \'\',
        answer TEXT NOT NULL DEFAULT \'\',
        ice_caller TEXT NOT NULL DEFAULT \'[]\',
        ice_callee TEXT NOT NULL DEFAULT \'[]\',
        created_at INTEGER NOT NULL,
        answered_at INTEGER NOT NULL DEFAULT 0,
        ended_at INTEGER NOT NULL DEFAULT 0
    )');
    add_column_if_missing($pdo, 'calls', 'diag_caller', 'TEXT NOT NULL DEFAULT \'\'');
    add_column_if_missing($pdo, 'calls', 'diag_callee', 'TEXT NOT NULL DEFAULT \'\'');
    add_column_if_missing($pdo, 'calls', 'record_id', 'INTEGER NOT NULL DEFAULT 0');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls (caller_id, id DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls (callee_id, id DESC)');

    $pdo->exec('CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT \'text\',
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_friends_user ON friends (user_id, status)');

    $pdo->exec('CREATE TABLE IF NOT EXISTS presence (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        chat_id INTEGER NOT NULL DEFAULT 0,
        typing_until INTEGER NOT NULL DEFAULT 0,
        last_seen INTEGER NOT NULL
    )');

    add_column_if_missing($pdo, 'presence', 'status', 'TEXT NOT NULL DEFAULT \'online\'');
    add_column_if_missing($pdo, 'presence', 'auto_reply', 'TEXT NOT NULL DEFAULT \'\'');
    add_column_if_missing($pdo, 'presence', 'last_auto', 'INTEGER NOT NULL DEFAULT 0');

    $pdo->exec('CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL DEFAULT \'\',
        ip TEXT NOT NULL DEFAULT \'\',
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
    )');

    add_column_if_missing($pdo, 'devices', 'ua', 'TEXT NOT NULL DEFAULT \'\'');

    $pdo->exec('CREATE TABLE IF NOT EXISTS link_cards (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT \'\',
        description TEXT NOT NULL DEFAULT \'\',
        image TEXT NOT NULL DEFAULT \'\',
        site TEXT NOT NULL DEFAULT \'\',
        fetched_at INTEGER NOT NULL
    )');

    $lobby = (int)$pdo->query('SELECT id FROM chats WHERE is_default = 1 LIMIT 1')->fetchColumn();
    if ($lobby === 0) {
        $pdo->prepare('INSERT INTO chats (type, name, dm_key, owner_id, is_default, created_at) VALUES (\'group\', ?, NULL, NULL, 1, ?)')
            ->execute([PARLZ_LOBBY, time()]);
    }

    backfill_merged_avatars($pdo);
}

function fill_item_avatars(array &$items, array $byId, array $byName): bool
{
    $changed = false;
    foreach ($items as &$item) {
        if (!is_array($item)) {
            continue;
        }
        if ((string)($item['kind'] ?? '') === 'merged' && is_string($item['body'] ?? null)) {
            $inner = json_decode($item['body'], true);
            if (is_array($inner) && is_array($inner['items'] ?? null) && fill_item_avatars($inner['items'], $byId, $byName)) {
                $item['body'] = (string)json_encode($inner, JSON_UNESCAPED_UNICODE);
                $changed = true;
            }
        }
        if ((string)($item['avatar'] ?? '') !== '') {
            continue;
        }
        $avatar = '';
        if (preg_match('/^U(\d{1,12})$/i', (string)($item['uid'] ?? '')) === 1) {
            $avatar = $byId[(int)substr(strtoupper((string)$item['uid']), 1)] ?? '';
        }
        if ($avatar === '') {
            $avatar = $byName[trim((string)($item['name'] ?? ''))] ?? '';
        }
        if ($avatar === '') {
            continue;
        }
        $item['avatar'] = $avatar;
        $changed = true;
    }
    unset($item);
    return $changed;
}

function backfill_merged_avatars(PDO $pdo): void
{
    if ((int)$pdo->query('PRAGMA user_version')->fetchColumn() >= 3) {
        return;
    }
    $byId = [];
    $byName = [];
    foreach ($pdo->query('SELECT id, nickname, avatar FROM users')->fetchAll() as $row) {
        $avatar = (string)$row['avatar'];
        if ($avatar === '' || !is_file(PARLZ_AVATAR_DIR . '/' . $avatar)) {
            continue;
        }
        $byId[(int)$row['id']] = $avatar;
        $name = trim((string)$row['nickname']);
        if ($name !== '') {
            $byName[$name] = isset($byName[$name]) && $byName[$name] !== $avatar ? '' : $avatar;
        }
    }
    foreach ($byName as $name => $avatar) {
        if ($avatar === '') {
            unset($byName[$name]);
        }
    }
    if ($byId !== []) {
        $rows = $pdo->query('SELECT id, body FROM messages WHERE kind = \'merged\'')->fetchAll();
        $update = $pdo->prepare('UPDATE messages SET body = ? WHERE id = ?');
        foreach ($rows as $row) {
            $decoded = json_decode((string)$row['body'], true);
            if (!is_array($decoded) || !is_array($decoded['items'] ?? null)) {
                continue;
            }
            if (fill_item_avatars($decoded['items'], $byId, $byName)) {
                $update->execute([(string)json_encode($decoded, JSON_UNESCAPED_UNICODE), (int)$row['id']]);
            }
        }
    }
    $pdo->exec('PRAGMA user_version = 3');
}

function ensure_upload_dir(): void
{
    if (!is_dir(PARLZ_UPLOAD_DIR) && !mkdir(PARLZ_UPLOAD_DIR, 0775, true) && !is_dir(PARLZ_UPLOAD_DIR)) {
        throw new RuntimeException('无法创建图片目录: ' . PARLZ_UPLOAD_DIR);
    }
}

function lobby_chat_id(): int
{
    $id = (int)db()->query('SELECT id FROM chats WHERE is_default = 1 LIMIT 1')->fetchColumn();
    if ($id === 0) {
        throw new RuntimeException('默认群聊缺失，请删除 data/parlz.sqlite 后重试');
    }
    return $id;
}

function join_chat(int $chatId, int $userId): void
{
    db()->prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, joined_at, last_read) VALUES (?, ?, ?, 0)')
        ->execute([$chatId, $userId, time()]);
}
