<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];
$query = trim((string)($_GET['q'] ?? ''));

if (mb_strlen($query) < 2) {
    json_out(['ok' => true, 'results' => []]);
}
if (mb_strlen($query) > 40) {
    $query = mb_substr($query, 0, 40);
}

rate_guard('search', (string)$uid, 40, 60);

json_out(['ok' => true, 'results' => messages_search($uid, $query, 60)]);
