<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];

require_post();
$data = request_data();
$action = (string)($data['action'] ?? 'register');
$token = (string)(preg_replace('/[^a-f0-9]/i', '', (string)($data['token'] ?? '')) ?? '');
if (strlen($token) < 32) {
    fail('设备令牌不对');
}

if ($action === 'unregister') {
    push_forget_token($token);
    json_out(['ok' => true, 'removed' => true]);
}

db_write(static function () use ($uid, $token): void {
    $now = time();
    db()->prepare('INSERT INTO push_tokens (user_id, platform, token, created_at, updated_at) VALUES (?, \'ios\', ?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at')
        ->execute([$uid, $token, $now, $now]);
});

json_out(['ok' => true, 'enabled' => (bool)(push_config()['enabled'] ?? false)]);
