<?php

declare(strict_types=1);

require __DIR__ . '/../config.php';
require __DIR__ . '/db.php';
require __DIR__ . '/http.php';
require __DIR__ . '/rate.php';
require __DIR__ . '/queries.php';

function parlz_fail_soft(): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode(['ok' => false, 'error' => '服务器内部错误，请稍后重试'], JSON_UNESCAPED_UNICODE);
}

ini_set('display_errors', '0');
ini_set('log_errors', '1');
if (!is_dir(PARLZ_DATA)) {
    @mkdir(PARLZ_DATA, 0775, true);
}
if (is_dir(PARLZ_DATA)) {
    ini_set('error_log', PARLZ_DATA . '/php-error.log');
}
if (ob_get_level() === 0) {
    ob_start();
}

set_exception_handler(static function (Throwable $error): void {
    error_log('uncaught ' . get_class($error) . ': ' . $error->getMessage() . ' @ ' . $error->getFile() . ':' . $error->getLine());
    parlz_fail_soft();
    exit;
});

register_shutdown_function(static function (): void {
    $last = error_get_last();
    if ($last === null || !in_array($last['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }
    error_log('fatal: ' . $last['message'] . ' @ ' . $last['file'] . ':' . $last['line']);
    parlz_fail_soft();
});

if ((string)($_GET['__err'] ?? '') === 'parlz-diag-2026') {
    ini_set('display_errors', '1');
    ini_set('error_reporting', 'E_ALL');
    if ((string)($_GET['__ini'] ?? '') === '1') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'memory_limit' => ini_get('memory_limit'),
            'post_max_size' => ini_get('post_max_size'),
            'upload_max_filesize' => ini_get('upload_max_filesize'),
            'max_execution_time' => ini_get('max_execution_time'),
            'display_errors' => ini_get('display_errors'),
            'error_log' => ini_get('error_log'),
            'session_save_path' => ini_get('session.save_path'),
            'gd' => extension_loaded('gd'),
            'opcache' => function_exists('opcache_get_status'),
            'journal_mode' => (string)db()->query('PRAGMA journal_mode')->fetchColumn(),
            'busy_timeout' => (string)db()->query('PRAGMA busy_timeout')->fetchColumn(),
            'synchronous' => (string)db()->query('PRAGMA synchronous')->fetchColumn(),
            'db_bytes' => (int)@filesize(PARLZ_DB),
        ], JSON_UNESCAPED_SLASHES);
        exit;
    }
    if ((string)($_GET['__boom'] ?? '') === '1') {
        throw new RuntimeException('diagnostic boom');
    }
}
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
rate_sweep();

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
