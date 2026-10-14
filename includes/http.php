<?php

declare(strict_types=1);

function json_out(array $payload, int $status = 200): never
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400): never
{
    json_out(['ok' => false, 'error' => $message], $status);
}

function request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return $_POST;
    }
    $data = json_decode($raw, true);
    if (is_array($data)) {
        return $data;
    }
    return $_POST;
}

function require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        fail('该接口仅接受 POST 请求', 405);
    }
}

function field(array $data, string $key, int $max, string $label): string
{
    $value = trim((string)($data[$key] ?? ''));
    if ($value === '') {
        fail($label . '不能为空');
    }
    if (mb_strlen($value) > $max) {
        fail($label . '不能超过 ' . $max . ' 个字符');
    }
    return $value;
}

function int_field(array $data, string $key, string $label): int
{
    $value = $data[$key] ?? null;
    if (!is_numeric($value) || (int)$value <= 0) {
        fail($label . '参数无效');
    }
    return (int)$value;
}

function current_user(): ?array
{
    $id = (int)($_SESSION['uid'] ?? 0);
    if ($id <= 0) {
        return null;
    }

    $token = (string)($_SESSION['device'] ?? '');
    if ($token === '') {
        $_SESSION['device'] = device_register($id);
    } elseif (!device_check($id, $token)) {
        unset($_SESSION['uid'], $_SESSION['device']);
        return null;
    }

    $stmt = db()->prepare('SELECT id, username, nickname, bio, avatar, email, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row === false) {
        unset($_SESSION['uid'], $_SESSION['device']);
        return null;
    }
    $row['uid'] = user_uid((int)$row['id']);
    session_write_close();
    return $row;
}

function require_user(): array
{
    $user = current_user();
    if ($user === null) {
        fail('请先登录', 401);
    }
    return $user;
}

function asset(string $path): string
{
    $file = PARLZ_ROOT . '/' . $path;
    $version = is_file($file) ? (string)filemtime($file) : '0';
    return $path . '?v=' . $version;
}
