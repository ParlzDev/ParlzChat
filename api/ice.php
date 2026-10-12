<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

json_out([
    'ok' => true,
    'turn' => PARLZ_TURN_HOST === '' ? null : [
        'host' => PARLZ_TURN_HOST,
        'port' => PARLZ_TURN_PORT,
        'user' => PARLZ_TURN_USER,
        'pass' => PARLZ_TURN_PASS,
        'tls' => PARLZ_TURN_TLS,
        'transport' => PARLZ_TURN_TRANSPORT,
    ],
]);
