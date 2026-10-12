<?php

declare(strict_types=1);

function rate_scope(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function rate_ready(): bool
{
    static $ready = null;
    if ($ready === null) {
        $ready = (int)@db()->query("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'rate_limits'")->fetchColumn() > 0;
    }
    return $ready;
}

function rate_guard(string $bucket, string $scope, int $limit, int $window): void
{
    if (!rate_ready()) {
        return;
    }
    $key = $bucket . ':' . sha1($scope);
    $now = time();

    $stmt = db()->prepare('SELECT window_start, hits FROM rate_limits WHERE key = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();

    if ($row === false || $now - (int)$row['window_start'] >= $window) {
        db_write(static function () use ($key, $now): void {
            db()->prepare('INSERT OR REPLACE INTO rate_limits (key, window_start, hits) VALUES (?, ?, 1)')->execute([$key, $now]);
        });
        return;
    }

    $hits = (int)$row['hits'];
    if ($hits >= $limit) {
        $wait = max(1, $window - ($now - (int)$row['window_start']));
        fail('操作太频繁，请 ' . $wait . ' 秒后再试', 429);
    }

    db_write(static function () use ($key): void {
        db()->prepare('UPDATE rate_limits SET hits = hits + 1 WHERE key = ?')->execute([$key]);
    });
}

function rate_clear(string $bucket, string $scope): void
{
    if (!rate_ready()) {
        return;
    }
    $key = $bucket . ':' . sha1($scope);
    db_write(static function () use ($key): void {
        db()->prepare('DELETE FROM rate_limits WHERE key = ?')->execute([$key]);
    });
}

function rate_sweep(): void
{
    if (!rate_ready() || random_int(1, 200) !== 1) {
        return;
    }
    db_write(static function (): void {
        db()->prepare('DELETE FROM rate_limits WHERE window_start < ?')->execute([time() - 86400]);
    });
}
