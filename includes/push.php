<?php

declare(strict_types=1);

function push_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $path = PARLZ_DATA . '/push.json';
    $config = ['enabled' => false];
    if (!is_file($path)) {
        return $config;
    }
    $raw = json_decode((string)file_get_contents($path), true);
    if (!is_array($raw)) {
        return $config;
    }
    $keyFile = (string)($raw['key_file'] ?? '');
    if ($keyFile !== '' && !preg_match('/^([A-Za-z]:[\\\\\/]|\/)/', $keyFile)) {
        $keyFile = PARLZ_DATA . '/' . $keyFile;
    }
    $config = [
        'enabled' => (bool)($raw['enabled'] ?? false) && $keyFile !== '' && is_file($keyFile),
        'key_id' => (string)($raw['key_id'] ?? ''),
        'team_id' => (string)($raw['team_id'] ?? ''),
        'topic' => (string)($raw['bundle_id'] ?? 'com.parlz.chatter'),
        'production' => (bool)($raw['production'] ?? true),
        'key_file' => $keyFile,
    ];
    return $config;
}

function push_b64(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function push_der_to_jose(string $der): string
{
    if ($der === '' || ord($der[0]) !== 0x30) {
        return '';
    }
    $offset = 2;
    if ((ord($der[1]) & 0x80) !== 0) {
        $offset = 2 + (ord($der[1]) & 0x7f);
    }
    if (!isset($der[$offset + 1])) {
        return '';
    }
    $rLen = ord($der[$offset + 1]);
    $r = substr($der, $offset + 2, $rLen);
    $offset += 2 + $rLen;
    if (!isset($der[$offset + 1])) {
        return '';
    }
    $sLen = ord($der[$offset + 1]);
    $s = substr($der, $offset + 2, $sLen);
    $r = str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT);
    $s = str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);
    if (strlen($r) !== 32 || strlen($s) !== 32) {
        return '';
    }
    return $r . $s;
}

function push_jwt(array $config): string
{
    $key = (string)file_get_contents((string)$config['key_file']);
    $header = push_b64((string)json_encode(['alg' => 'ES256', 'kid' => (string)$config['key_id']]));
    $claims = push_b64((string)json_encode(['iss' => (string)$config['team_id'], 'iat' => time()]));
    $input = $header . '.' . $claims;
    $der = '';
    if (!openssl_sign($input, $der, $key, OPENSSL_ALGO_SHA256)) {
        return '';
    }
    $jose = push_der_to_jose($der);
    if ($jose === '') {
        return '';
    }
    return $input . '.' . push_b64($jose);
}

function push_send(string $token, string $title, string $body, int $chatId, int $badge, ?array $config = null): array
{
    $config = $config ?? push_config();
    if (($config['enabled'] ?? false) !== true || $token === '') {
        return ['ok' => false, 'error' => 'push 未配置'];
    }
    $jwt = push_jwt($config);
    if ($jwt === '') {
        return ['ok' => false, 'error' => 'JWT 签发失败'];
    }
    $host = ($config['production'] ?? true) ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    $payload = [
        'aps' => [
            'alert' => ['title' => $title, 'body' => $body],
            'sound' => 'default',
            'badge' => max(0, $badge),
            'thread-id' => 'parlz-chat-' . $chatId,
        ],
        'chat_id' => $chatId,
    ];
    $ch = curl_init($host . '/3/device/' . $token);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0,
        CURLOPT_POSTFIELDS => (string)json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => [
            'authorization: bearer ' . $jwt,
            'apns-topic: ' . (string)$config['topic'],
            'apns-push-type: alert',
            'apns-priority: 10',
            'apns-expiration: ' . (time() + 86400),
            'content-type: application/json',
        ],
    ]);
    $result = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($status === 200) {
        return ['ok' => true, 'status' => 200];
    }
    return ['ok' => false, 'status' => $status, 'error' => $error !== '' ? $error : (string)$result];
}

function push_tokens_for_user(int $userId): array
{
    $stmt = db()->prepare('SELECT token FROM push_tokens WHERE user_id = ? AND platform = ?');
    $stmt->execute([$userId, 'ios']);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function push_forget_token(string $token): void
{
    db_write(static function () use ($token): void {
        db()->prepare('DELETE FROM push_tokens WHERE token = ?')->execute([$token]);
    });
}

function push_chat_message(int $chatId, int $senderId, string $senderName, string $title, string $body, string $kind): void
{
    if (($kind === 'recalled' || $kind === 'poke')) {
        return;
    }
    $config = push_config();
    if (($config['enabled'] ?? false) !== true) {
        return;
    }
    $stmt = db()->prepare('SELECT user_id, muted FROM chat_members WHERE chat_id = ? AND user_id <> ?');
    $stmt->execute([$chatId, $senderId]);
    $members = $stmt->fetchAll();
    if ($members === []) {
        return;
    }
    $name = $title !== '' ? $title : $senderName;
    foreach ($members as $member) {
        if ((int)($member['muted'] ?? 0) === 1) {
            continue;
        }
        $userId = (int)$member['user_id'];
        $tokens = push_tokens_for_user($userId);
        if ($tokens === []) {
            continue;
        }
        $unreadStmt = db()->prepare('SELECT COUNT(*) FROM messages m JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ? WHERE m.chat_id = ? AND m.user_id <> ? AND m.id > cm.last_read');
        $unreadStmt->execute([$userId, $chatId, $userId]);
        $badge = (int)$unreadStmt->fetchColumn();
        foreach ($tokens as $token) {
            $result = push_send($token, $name, $body, $chatId, $badge, $config);
            if (($result['ok'] ?? true) !== true && in_array((int)($result['status'] ?? 0), [400, 410], true)) {
                push_forget_token($token);
            }
        }
    }
}

function push_preview(string $kind, string $body): string
{
    if (in_array($kind, ['sticker', 'csticker'], true)) {
        return '[表情]';
    }
    if ($kind === 'image') {
        return '[图片]';
    }
    if ($kind === 'voice') {
        return '[语音]';
    }
    if ($kind === 'file') {
        $decoded = json_decode($body, true);
        return is_array($decoded) ? '[文件] ' . (string)($decoded['name'] ?? '') : '[文件]';
    }
    if ($kind === 'merged') {
        return '[聊天记录]';
    }
    if ($kind === 'groupcard') {
        return '[群名片]';
    }
    if ($kind === 'call') {
        return '[通话]';
    }
    if ($kind === 'quote') {
        $decoded = json_decode($body, true);
        $text = is_array($decoded) ? (string)($decoded['text'] ?? '') : '';
        return $text !== '' ? $text : '[引用]';
    }
    $text = trim($body);
    return mb_strlen($text) > 60 ? mb_substr($text, 0, 60) . '…' : $text;
}
