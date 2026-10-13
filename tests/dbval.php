<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('cli only');
}

require __DIR__ . '/../includes/bootstrap.php';

$name = (string)($argv[1] ?? '');
$arg = (string)($argv[2] ?? '');

if ($name === 'users_by_email') {
    $stmt = db()->prepare('SELECT username FROM users WHERE email = ?');
    $stmt->execute([$arg]);
    echo implode(',', $stmt->fetchAll(PDO::FETCH_COLUMN)) . PHP_EOL;
    exit;
}

if ($name === 'uid') {
    $stmt = db()->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$arg]);
    echo (string)$stmt->fetchColumn() . PHP_EOL;
    exit;
}

if ($name === 'user_email') {
    $stmt = db()->prepare('SELECT email FROM users WHERE username = ?');
    $stmt->execute([$arg]);
    echo (string)$stmt->fetchColumn() . PHP_EOL;
    exit;
}

if ($name === 'device_count') {
    $stmt = db()->prepare('SELECT COUNT(*) FROM devices WHERE user_id = ?');
    $stmt->execute([(int)$arg]);
    echo (string)$stmt->fetchColumn() . PHP_EOL;
    exit;
}

if ($name === 'clear_codes') {
    echo 'cleared=' . (int)db()->exec('DELETE FROM email_codes') . PHP_EOL;
    exit;
}

if ($name === 'ids_like') {
    $stmt = db()->prepare("SELECT id FROM users WHERE username LIKE ? ORDER BY id");
    $stmt->execute([$arg . '%']);
    echo implode(' ', array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN))) . PHP_EOL;
    exit;
}

if ($name === 'rate_dump') {
    foreach (db()->query('SELECT key, hits, window_start FROM rate_limits ORDER BY window_start DESC LIMIT 12') as $row) {
        echo $row['key'] . ' hits=' . (int)$row['hits'] . ' age=' . (time() - (int)$row['window_start']) . 's' . PHP_EOL;
    }
    exit;
}

if ($name === 'list_users') {
    foreach (db()->query('SELECT id, username FROM users ORDER BY id') as $row) {
        echo (int)$row['id'] . ' ' . $row['username'] . PHP_EOL;
    }
    exit;
}

if ($name === 'seed_code') {
    $code = (string)($argv[3] ?? '246810');
    $purpose = (string)($argv[4] ?? 'register');
    db()->prepare('DELETE FROM email_codes WHERE email = ?')->execute([$arg]);
    db()->prepare('INSERT INTO email_codes (email, code, purpose, tries, used, created_at, expires_at) VALUES (?, ?, ?, 0, 0, ?, ?)')
        ->execute([$arg, $code, $purpose, time(), time() + 600]);
    echo 'seeded=' . $arg . PHP_EOL;
    exit;
}

if ($name === 'friends') {    $stmt = db()->prepare("SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'");
    $stmt->execute([(int)$arg]);
    echo implode(',', array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN))) . PHP_EOL;
    exit;
}

if ($name === 'gcall_rows') {
    $chat = (int)$arg;
    $states = (int)db()->query('SELECT COUNT(*) FROM group_call_states')->fetchColumn();
    $members = (int)db()->query('SELECT COUNT(*) FROM group_call_members')->fetchColumn();
    $signals = (int)db()->query('SELECT COUNT(*) FROM group_call_signals')->fetchColumn();
    echo 'states=' . $states . ' members=' . $members . ' signals=' . $signals . ' chat=' . $chat . PHP_EOL;
    exit;
}

if ($name === 'code') {
    $stmt = db()->prepare('SELECT code FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1');
    $stmt->execute([$arg]);
    $code = $stmt->fetchColumn();
    echo ($code === false ? 'none' : (string)$code) . PHP_EOL;
    exit;
}

echo 'unknown' . PHP_EOL;
