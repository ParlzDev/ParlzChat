<?php

declare(strict_types=1);

require __DIR__ . '/../config.php';
require __DIR__ . '/db.php';
require __DIR__ . '/http.php';
require __DIR__ . '/queries.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');
if (ob_get_level() === 0) {
    ob_start();
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    $parlzHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    ini_set('session.gc_maxlifetime', '31536000');
    ini_set('session.cookie_lifetime', '31536000');
    session_name('parlz_sid');
    session_set_cookie_params([
        'lifetime' => 31536000,
        'path' => '/',
        'httponly' => true,
        'secure' => $parlzHttps,
        'samesite' => 'Lax',
    ]);
    session_start();
}

db();

function parlz_build_time(): int
{
    $latest = 0;
    foreach (['/assets/scripts', '/assets/style'] as $dir) {
        $path = PARLZ_ROOT . $dir;
        foreach (scandir($path) ?: [] as $entry) {
            $file = $path . '/' . $entry;
            if (is_file($file)) {
                $latest = max($latest, (int)@filemtime($file));
            }
        }
    }
    return max($latest, (int)@filemtime(PARLZ_ROOT . '/index.php'));
}
