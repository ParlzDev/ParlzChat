<?php

declare(strict_types=1);

function table_has_column(PDO $pdo, string $table, string $column): bool
{
    foreach (@$pdo->query('PRAGMA table_info(' . $table . ')') ?: [] as $row) {
        if ((string)$row['name'] === $column) {
            return true;
        }
    }
    return false;
}

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
    $pdo->exec('PRAGMA busy_timeout = 15000');
    $pdo->exec('PRAGMA synchronous = NORMAL');

    $stamp = (string)@md5_file(__DIR__ . '/db.php');
    $tables = (int)@$pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('rate_limits', 'messages_fts', 'stt_texts', 'email_codes', 'group_call_states', 'group_call_members', 'group_call_signals')")->fetchColumn();
    $ready = table_has_column($pdo, 'users', 'email') && table_has_column($pdo, 'messages', 'meta');
    if ($tables < 7 || !$ready || $stamp === '' || @file_get_contents(PARLZ_DATA . '/schema.stamp') !== $stamp) {
        migrate($pdo);
        @file_put_contents(PARLZ_DATA . '/schema.stamp', $stamp);
    }

    return $pdo;
}

function db_write(callable $run): void
{
    static $lock = null;
    static $lockReady = false;
    if (!$lockReady) {
        $lockReady = true;
        $handle = @fopen(PARLZ_DATA . '/write.lock', 'c');
        $lock = $handle === false ? null : $handle;
    }
    if ($lock !== null) {
        @flock($lock, LOCK_EX);
    }
    try {
        for ($attempt = 0; ; $attempt++) {
            try {
                $run();
                return;
            } catch (PDOException $error) {
                if ($attempt >= 9 || stripos((string)$error->getMessage(), 'database is locked') === false) {
                    throw $error;
                }
                usleep(150000 + $attempt * 150000 + random_int(0, 80000));
            }
        }
    } finally {
        if ($lock !== null) {
            @flock($lock, LOCK_UN);
        }
    }
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
    add_column_if_missing($pdo, 'messages', 'meta', 'TEXT NOT NULL DEFAULT \'\'');
    backfill_card_meta($pdo);
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_friends_user ON friends (user_id, status)');

    $pdo->exec('CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        hits INTEGER NOT NULL DEFAULT 0
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS stt_texts (
        key TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS email_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT \'register\',
        tries INTEGER NOT NULL DEFAULT 0,
        used INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_email_codes ON email_codes (email, created_at)');

    $chatColumns = [];
    foreach ($pdo->query('PRAGMA table_info(chats)') as $column) {
        $chatColumns[] = (string)$column['name'];
    }
    if (!in_array('search_mode', $chatColumns, true)) {
        $pdo->exec("ALTER TABLE chats ADD COLUMN search_mode TEXT NOT NULL DEFAULT 'both'");
    }
    if (!in_array('join_mode', $chatColumns, true)) {
        $pdo->exec("ALTER TABLE chats ADD COLUMN join_mode TEXT NOT NULL DEFAULT 'verify'");
    }

    $userColumns = [];
    foreach ($pdo->query('PRAGMA table_info(users)') as $column) {
        $userColumns[] = (string)$column['name'];
    }
    if (!in_array('email', $userColumns, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN email TEXT');
    }
    if (!in_array('is_admin', $userColumns, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
        $pdo->exec('UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users)');
    }

    try {
        $pdo->exec('DROP TABLE IF EXISTS messages_fts');
        try {
            $pdo->exec("CREATE VIRTUAL TABLE messages_fts USING fts5(body, content='messages', content_rowid='id', tokenize='trigram')");
        } catch (Throwable $tokenizerError) {
            $pdo->exec("CREATE VIRTUAL TABLE messages_fts USING fts5(body, content='messages', content_rowid='id')");
        }
        $pdo->exec('CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body); END');
        $pdo->exec('CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, body) VALUES (\'delete\', old.id, old.body); END');
        $pdo->exec('CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN INSERT INTO messages_fts(messages_fts, rowid, body) VALUES (\'delete\', old.id, old.body); INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body); END');
        $pdo->exec('INSERT INTO messages_fts(rowid, body) SELECT id, body FROM messages');
    } catch (Throwable $ftsError) {
        $pdo->exec('CREATE TABLE IF NOT EXISTS messages_search_off (id INTEGER PRIMARY KEY)');
    }

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

    $pdo->exec('CREATE TABLE IF NOT EXISTS user_days (
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS mini_apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT \'\',
        brief TEXT NOT NULL DEFAULT \'\',
        status TEXT NOT NULL DEFAULT \'draft\',
        review_note TEXT NOT NULL DEFAULT \'\',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS mini_files (
        app_id INTEGER NOT NULL,
        ext TEXT NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (app_id, ext)
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS face_codes (
        code TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        joined_by INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )');

    add_column_if_missing($pdo, 'face_codes', 'joined_by', 'INTEGER NOT NULL DEFAULT 0');
    add_column_if_missing($pdo, 'group_call_members', 'last_seen', 'INTEGER NOT NULL DEFAULT 0');
    $pdo->exec('UPDATE group_call_members SET last_seen = joined_at WHERE last_seen = 0');

    $pdo->exec('DELETE FROM face_codes WHERE created_at < ' . (time() - 3600));
    $pdo->exec('DELETE FROM chats WHERE is_default = 1');

    $pdo->exec('CREATE TABLE IF NOT EXISTS group_call_states (
        chat_id INTEGER PRIMARY KEY,
        started_by INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS group_call_members (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        muted INTEGER NOT NULL DEFAULT 0,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, user_id)
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS group_call_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        from_uid INTEGER NOT NULL,
        to_uid INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS gcs_target ON group_call_signals (chat_id, to_uid, id)');

    $pdo->exec('DELETE FROM group_call_signals WHERE created_at < ' . (time() - 180));

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

function backfill_card_meta(PDO $pdo): void
{
    $legacy = $pdo->query("SELECT id, body FROM messages WHERE kind = 'groupcard' AND meta = '' AND body LIKE '{%'")->fetchAll();
    if ($legacy === []) {
        return;
    }
    $stmt = $pdo->prepare("UPDATE messages SET meta = ?, body = ? WHERE id = ? AND meta = ''");
    foreach ($legacy as $row) {
        $card = json_decode((string)$row['body'], true);
        if (!is_array($card) || (int)($card['chat_id'] ?? 0) <= 0) {
            continue;
        }
        $name = trim((string)($card['name'] ?? ''));
        $stmt->execute([(string)$row['body'], '[群名片] ' . ($name === '' ? '群聊' : $name), (int)$row['id']]);
    }
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

function user_day_bump(int $userId): void
{
    db_write(static function () use ($userId): void {
        db()->prepare('INSERT INTO user_days (user_id, day, count) VALUES (?, ?, 1)
            ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1')
            ->execute([$userId, gmdate('Y-m-d')]);
    });
}

function level_of(int $userId): int
{
    static $cache = [];
    if (isset($cache[$userId])) {
        return $cache[$userId];
    }
    if ($userId <= 0) {
        return 0;
    }
    $stmt = db()->prepare('SELECT SUM(MIN(count, 5)) / 5.0 FROM user_days WHERE user_id = ?');
    $stmt->execute([$userId]);
    $days = (float)$stmt->fetchColumn();
    $level = (int)floor(sqrt($days + 4) - 2);
    $level = $level < 1 ? 1 : $level;
    $cache[$userId] = $level;
    return $level;
}

function join_chat(int $chatId, int $userId): void
{
    db()->prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, joined_at, last_read) VALUES (?, ?, ?, 0)')
        ->execute([$chatId, $userId, time()]);
}
