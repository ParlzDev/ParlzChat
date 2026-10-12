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

function parlz_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function parlz_set_device_cookie(string $token): void
{
    setcookie('parlz_device', $token, [
        'expires' => time() + 31536000,
        'path' => '/',
        'httponly' => true,
        'secure' => parlz_is_https(),
        'samesite' => 'Lax',
    ]);
}

function parlz_clear_device_cookie(): void
{
    setcookie('parlz_device', '', [
        'expires' => time() - 42000,
        'path' => '/',
        'httponly' => true,
        'secure' => parlz_is_https(),
        'samesite' => 'Lax',
    ]);
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    ini_set('session.gc_maxlifetime', '31536000');
    ini_set('session.cookie_lifetime', '31536000');
    session_name('parlz_sid');
    session_set_cookie_params([
        'lifetime' => 31536000,
        'path' => '/',
        'httponly' => true,
        'secure' => parlz_is_https(),
        'samesite' => 'Lax',
    ]);
    session_start();
}

db();

if ((int)($_SESSION['uid'] ?? 0) <= 0) {
    $parlzRemember = (string)($_COOKIE['parlz_device'] ?? '');
    if (preg_match('/^[0-9a-f]{32}$/', $parlzRemember) === 1) {
        $stmt = db()->prepare('SELECT user_id FROM devices WHERE token = ?');
        $stmt->execute([$parlzRemember]);
        $row = $stmt->fetch();
        if ($row !== false) {
            $_SESSION['uid'] = (int)$row['user_id'];
            $_SESSION['device'] = $parlzRemember;
        }
    }
}

if ((int)($_SESSION['uid'] ?? 0) > 0) {
    $parlzToken = (string)($_SESSION['device'] ?? '');
    if ($parlzToken !== '' && (string)($_COOKIE['parlz_device'] ?? '') !== $parlzToken) {
        parlz_set_device_cookie($parlzToken);
    }
}

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
