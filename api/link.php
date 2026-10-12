<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/link.php';

require_user();

$url = link_normalize((string)($_GET['url'] ?? ''));
if ($url === '') {
    fail('仅支持 http 或 https 链接');
}

$cached = link_card_get($url);
if ($cached !== null) {
    json_out(['ok' => true, 'card' => $cached === [] ? null : $cached, 'cached' => true]);
}

$card = link_fetch($url);
link_card_save($url, $card);

json_out(['ok' => true, 'card' => $card === [] ? null : $card, 'cached' => false]);
