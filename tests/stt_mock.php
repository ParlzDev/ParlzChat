<?php

declare(strict_types=1);

$raw = (string)file_get_contents('php://input');
$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'text' => '（mock）收到 ' . strlen($raw) . ' 字节 file=' . (strpos($raw, 'filename="') !== false ? '1' : '0')
        . ' model=' . (strpos($raw, 'name="model"') !== false ? '1' : '0')
        . ' auth=' . (str_starts_with($auth, 'Bearer ') ? '1' : '0'),
], JSON_UNESCAPED_UNICODE);
