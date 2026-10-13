<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];
$isAdmin = (int)($user['is_admin'] ?? 0) === 1;
$pdo = db();

function mini_exts(): array
{
    return ['phtml', 'pcss', 'pjs', 'pphp'];
}

function mini_is_owner_or_admin(array $app, int $uid, bool $isAdmin): bool
{
    return $isAdmin || (int)$app['owner_id'] === $uid;
}

function mini_files(int $appId): array
{
    $files = [];
    foreach (mini_exts() as $ext) {
        $files[$ext] = '';
    }
    $stmt = db()->prepare('SELECT ext, body FROM mini_files WHERE app_id = ?');
    $stmt->execute([$appId]);
    foreach ($stmt->fetchAll() as $row) {
        if (in_array((string)$row['ext'], mini_exts(), true)) {
            $files[(string)$row['ext']] = (string)$row['body'];
        }
    }
    return $files;
}

function mini_meta(array $row, array $files): array
{
    return [
        'id' => (int)$row['id'],
        'owner_id' => (int)$row['owner_id'],
        'name' => (string)$row['name'],
        'icon' => (string)$row['icon'],
        'brief' => (string)$row['brief'],
        'status' => (string)$row['status'],
        'review_note' => (string)$row['review_note'],
        'created_at' => (int)$row['created_at'],
        'updated_at' => (int)$row['updated_at'],
        'files' => $files,
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $action = (string)($_GET['action'] ?? 'list');
    if ($action === 'list') {
        $stmt = $pdo->prepare('SELECT a.*, u.nickname AS owner_name FROM mini_apps a JOIN users u ON u.id = a.owner_id
            WHERE a.status = \'approved\' OR a.owner_id = ? ORDER BY a.updated_at DESC LIMIT 60');
        $stmt->execute([$uid]);
        $apps = [];
        foreach ($stmt->fetchAll() as $row) {
            $apps[] = [
                'id' => (int)$row['id'],
                'name' => (string)$row['name'],
                'icon' => (string)$row['icon'],
                'brief' => (string)$row['brief'],
                'status' => (string)$row['status'],
                'owner_name' => (string)$row['owner_name'],
                'mine' => (int)$row['owner_id'] === $uid,
                'review_note' => (string)$row['review_note'],
                'updated_at' => (int)$row['updated_at'],
            ];
        }
        $pending = [];
        if ($isAdmin) {
            $rows = $pdo->query('SELECT a.*, u.nickname AS owner_name FROM mini_apps a JOIN users u ON u.id = a.owner_id
                WHERE a.status = \'pending\' ORDER BY a.updated_at ASC LIMIT 40')->fetchAll();
            foreach ($rows as $row) {
                $pending[] = [
                    'id' => (int)$row['id'],
                    'name' => (string)$row['name'],
                    'brief' => (string)$row['brief'],
                    'owner_name' => (string)$row['owner_name'],
                    'updated_at' => (int)$row['updated_at'],
                ];
            }
        }
        json_out(['ok' => true, 'apps' => $apps, 'pending' => $pending, 'is_admin' => $isAdmin]);
    }

    if ($action === 'get') {
        $id = (int)($_GET['id'] ?? 0);
        $stmt = $pdo->prepare('SELECT * FROM mini_apps WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row === false) {
            fail('小程序不存在', 404);
        }
        $mine = mini_is_owner_or_admin($row, $uid, $isAdmin);
        if ((string)$row['status'] !== 'approved' && !$mine) {
            fail('这个还没上线', 403);
        }
        json_out(['ok' => true, 'app' => mini_meta($row, mini_files($id)), 'is_admin' => $isAdmin]);
    }

    fail('未知操作');
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'save') {
    rate_guard('mini_save', (string)$uid, 60, 3600);
    $id = (int)($data['id'] ?? 0);
    $name = trim((string)($data['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 20) {
        fail('名字要 1-20 个字');
    }
    $brief = mb_substr(trim((string)($data['brief'] ?? '')), 0, 60);
    $icon = mb_substr(trim((string)($data['icon'] ?? '')), 0, 4);
    $files = [];
    foreach (mini_exts() as $ext) {
        $body = (string)($data['file_' . $ext] ?? '');
        if (strlen($body) > 60000) {
            fail($ext . ' 太长了（最多 60KB）');
        }
        $files[$ext] = $body;
    }
    $files['phtml'] = miniapp_clean_html($files['phtml']);
    $files['pcss'] = miniapp_clean_css($files['pcss']);
    $files['pjs'] = miniapp_clean_js($files['pjs']);

    if ($id > 0) {
        $stmt = $pdo->prepare('SELECT * FROM mini_apps WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row === false || !mini_is_owner_or_admin($row, $uid, $isAdmin)) {
            fail('改不了别人的小程序', 403);
        }
        db_write(static function () use ($pdo, $id, $name, $brief, $icon, $files): void {
            $pdo->prepare('UPDATE mini_apps SET name = ?, brief = ?, icon = ?, status = \'draft\', review_note = \'\', updated_at = ? WHERE id = ?')
                ->execute([$name, $brief, $icon, time(), $id]);
            foreach ($files as $ext => $body) {
                $pdo->prepare('INSERT INTO mini_files (app_id, ext, body) VALUES (?, ?, ?) ON CONFLICT(app_id, ext) DO UPDATE SET body = excluded.body')
                    ->execute([$id, $ext, $body]);
            }
        });
        json_out(['ok' => true, 'id' => $id, 'status' => 'draft']);
    }

    $newId = 0;
    db_write(static function () use ($pdo, $uid, $name, $brief, $icon, $files, &$newId): void {
        $pdo->prepare('INSERT INTO mini_apps (owner_id, name, icon, brief, status, review_note, created_at, updated_at) VALUES (?, ?, ?, ?, \'draft\', \'\', ?, ?)')
            ->execute([$uid, $name, $icon, $brief, time(), time()]);
        $newId = (int)$pdo->lastInsertId();
        foreach ($files as $ext => $body) {
            $pdo->prepare('INSERT INTO mini_files (app_id, ext, body) VALUES (?, ?, ?)')->execute([$newId, $ext, $body]);
        }
    });
    json_out(['ok' => true, 'id' => $newId, 'status' => 'draft']);
}

if ($action === 'submit') {
    $id = int_field($data, 'id', '小程序');
    $stmt = $pdo->prepare('SELECT * FROM mini_apps WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row === false || (int)$row['owner_id'] !== $uid) {
        fail('只能提交自己的小程序', 403);
    }
    if (trim((string)$row['name']) === '') {
        fail('先起个名字');
    }
    db_write(static function () use ($pdo, $id): void {
        $pdo->prepare('UPDATE mini_apps SET status = \'pending\', updated_at = ? WHERE id = ?')->execute([time(), $id]);
    });
    json_out(['ok' => true, 'status' => 'pending']);
}

if ($action === 'review') {
    if (!$isAdmin) {
        fail('只有管理员能审核', 403);
    }
    $id = int_field($data, 'id', '小程序');
    $verdict = (string)($data['verdict'] ?? '');
    if (!in_array($verdict, ['approve', 'reject'], true)) {
        fail('审核结果不对');
    }
    $note = mb_substr(trim((string)($data['note'] ?? '')), 0, 100);
    db_write(static function () use ($pdo, $id, $verdict, $note): void {
        $pdo->prepare('UPDATE mini_apps SET status = ?, review_note = ?, updated_at = ? WHERE id = ?')
            ->execute([$verdict === 'approve' ? 'approved' : 'rejected', $note, time(), $id]);
    });
    json_out(['ok' => true, 'status' => $verdict === 'approve' ? 'approved' : 'rejected']);
}

if ($action === 'delete') {
    $id = int_field($data, 'id', '小程序');
    $stmt = $pdo->prepare('SELECT * FROM mini_apps WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if ($row === false || !mini_is_owner_or_admin($row, $uid, $isAdmin)) {
        fail('删不了别人的小程序', 403);
    }
    db_write(static function () use ($pdo, $id): void {
        $pdo->prepare('DELETE FROM mini_files WHERE app_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM mini_apps WHERE id = ?')->execute([$id]);
    });
    json_out(['ok' => true]);
}

fail('未知操作');
