<?php

declare(strict_types=1);

require __DIR__ . '/config.php';

$name = basename((string)($_GET['f'] ?? ''));
if (preg_match('/^[A-Za-z0-9._-]{1,120}$/', $name) !== 1) {
    http_response_code(404);
    exit;
}

$path = PARLZ_UPLOAD_DIR . '/' . $name;
if (!is_file($path)) {
    http_response_code(404);
    exit;
}

$types = [
    'pdf' => 'application/pdf',
    'txt' => 'text/plain; charset=utf-8',
    'md' => 'text/plain; charset=utf-8',
    'csv' => 'text/plain; charset=utf-8',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
];

$ext = strtolower((string)pathinfo($name, PATHINFO_EXTENSION));
if (!isset($types[$ext])) {
    http_response_code(404);
    exit;
}

while (ob_get_level() > 0) {
    ob_end_clean();
}

header('Content-Type: ' . $types[$ext]);
header('Content-Disposition: inline; filename="' . rawurlencode($name) . '"');
header('Content-Length: ' . (string)filesize($path));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=600');

readfile($path);
