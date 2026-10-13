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

if ($name === 'code') {
    $stmt = db()->prepare('SELECT code FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1');
    $stmt->execute([$arg]);
    $code = $stmt->fetchColumn();
    echo ($code === false ? 'none' : (string)$code) . PHP_EOL;
    exit;
}

echo 'unknown' . PHP_EOL;
