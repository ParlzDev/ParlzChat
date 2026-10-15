<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('cli only');
}

$root = dirname(__DIR__, 2);
$dest = '';
$keep = 14;
$withFiles = false;

for ($i = 1; $i < $argc; $i += 1) {
    $arg = (string)$argv[$i];
    if (strpos($arg, '--dest=') === 0) {
        $dest = substr($arg, 7);
    } elseif (strpos($arg, '--keep=') === 0) {
        $keep = max(1, (int)substr($arg, 7));
    } elseif ($arg === '--files') {
        $withFiles = true;
    }
}

if ($dest === '') {
    fwrite(STDERR, '用法: php snapshot.php --dest=/www/backups/parlz [--keep=14] [--files]' . PHP_EOL);
    exit(2);
}

$dest = rtrim($dest, '/');
if (!is_dir($dest) && !mkdir($dest, 0750, true) && !is_dir($dest)) {
    fwrite(STDERR, '建目录失败: ' . $dest . PHP_EOL);
    exit(1);
}

$dbFile = $root . '/data/parlz.sqlite';
if (!is_file($dbFile)) {
    fwrite(STDERR, '找不到数据库: ' . $dbFile . PHP_EOL);
    exit(1);
}

$stamp = date('Ymd-His');
$gzPath = $dest . '/parlz-' . $stamp . '.sqlite.gz';
$tmpPath = $dest . '/parlz-' . $stamp . '.sqlite.tmp';

$pdo = new PDO('sqlite:' . $dbFile, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('PRAGMA busy_timeout = 5000');
$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');
$counts = [];
foreach (['users', 'chats', 'messages', 'devices', 'posts'] as $table) {
    try {
        $counts[$table] = (int)$pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
    } catch (Throwable $error) {
        $counts[$table] = -1;
    }
}
$pdo->exec('VACUUM INTO ' . $pdo->quote($tmpPath));
$pdo = null;

$check = new PDO('sqlite:' . $tmpPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$integrity = (string)$check->query('PRAGMA integrity_check')->fetchColumn();
$rawHash = hash_file('sha256', $tmpPath);
$check = null;

$in = fopen($tmpPath, 'rb');
$out = gzopen($gzPath, 'wb9');
if ($in === false || $out === false) {
    fwrite(STDERR, '写快照失败' . PHP_EOL);
    exit(1);
}
while (!feof($in)) {
    gzwrite($out, (string)fread($in, 1048576));
}
fclose($in);
gzclose($out);
@unlink($tmpPath);

$configs = [];
foreach (['data/mail.json', 'config.php', 'turn/config.json'] as $rel) {
    $src = $root . '/' . $rel;
    if (is_file($src)) {
        $target = $dest . '/parlz-' . $stamp . '.' . basename($rel);
        if (copy($src, $target)) {
            $configs[] = basename($target);
        }
    }
}

$extra = [];
if ($withFiles) {
    foreach (['assets/uploads', 'assets/avatars'] as $rel) {
        $src = $root . '/' . $rel;
        if (is_dir($src)) {
            $name = $dest . '/parlz-files-' . $stamp . '-' . basename($rel) . '.tar.gz';
            $cmd = 'tar -czf ' . escapeshellarg($name) . ' -C ' . escapeshellarg($root) . ' ' . escapeshellarg($rel) . ' 2>&1';
            exec($cmd, $lines, $code);
            if ($code === 0 && is_file($name)) {
                $extra[] = ['name' => basename($name), 'sha256' => (string)hash_file('sha256', $name), 'bytes' => (int)filesize($name)];
            }
        }
    }
}

$manifest = [
    'stamp' => $stamp,
    'time' => date('c'),
    'host' => (string)(gethostname() ?: ''),
    'db_bytes' => (int)filesize($gzPath),
    'sha256' => (string)hash_file('sha256', $gzPath),
    'raw_sha256' => $rawHash,
    'integrity' => $integrity,
    'counts' => $counts,
    'configs' => $configs,
    'files' => $extra,
];
$manifestPath = $dest . '/parlz-' . $stamp . '.manifest.json';
file_put_contents($manifestPath, json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL);

$pruned = [];
$archives = glob($dest . '/parlz-*.manifest.json');
if (is_array($archives)) {
    rsort($archives);
    $stale = array_slice($archives, $keep);
    foreach ($stale as $old) {
        $base = preg_replace('/\.manifest\.json$/', '', $old);
        foreach (glob($base . '.*') ?: [] as $victim) {
            @unlink($victim);
            $pruned[] = basename($victim);
        }
    }
}

echo json_encode([
    'ok' => $integrity === 'ok',
    'stamp' => $stamp,
    'archive' => basename($gzPath),
    'manifest' => basename($manifestPath),
    'pruned' => $pruned,
] + $manifest, JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($integrity === 'ok' ? 0 : 1);
