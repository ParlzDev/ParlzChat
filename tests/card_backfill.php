<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('cli only');
}

require __DIR__ . '/../includes/bootstrap.php';

$pdo = db();
$results = [];
$check = static function (string $name, bool $ok, string $detail = '') use (&$results): void {
    $results[] = ['name' => $name, 'ok' => $ok];
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($detail === '' ? '' : ' :: ' . $detail) . PHP_EOL;
};

$chatId = (int)$pdo->query('SELECT id FROM chats ORDER BY id LIMIT 1')->fetchColumn();
$member = $pdo->prepare('SELECT user_id FROM chat_members WHERE chat_id = ? LIMIT 1');
$member->execute([$chatId]);
$userId = (int)$member->fetchColumn();
if ($chatId === 0 || $userId === 0) {
    echo '没有可用会话，先跑一遍判据脚本' . PHP_EOL;
    exit(1);
}

$legacyBody = (string)json_encode(['chat_id' => 9, 'uid' => 'A00009', 'name' => '老群名', 'avatar' => '', 'members' => 4], JSON_UNESCAPED_UNICODE);
$pdo->prepare('INSERT INTO messages (chat_id, user_id, body, kind, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    ->execute([$chatId, $userId, $legacyBody, 'groupcard', '', time()]);
$id = (int)$pdo->lastInsertId();

$broken = (array)$pdo->query('SELECT body, meta FROM messages WHERE id = ' . $id)->fetch();
$check('插入了一条"正文里塞 JSON"的旧记录', (string)$broken['body'] === $legacyBody && (string)$broken['meta'] === '', (string)$broken['body']);

backfill_card_meta($pdo);

$fixed = (array)$pdo->query('SELECT body, meta FROM messages WHERE id = ' . $id)->fetch();
$check('回填后正文变成人类可读文本', (string)$fixed['body'] === '[群名片] 老群名', (string)$fixed['body']);
$check('回填后卡片数据搬到 meta', (string)$fixed['meta'] === $legacyBody, substr((string)$fixed['meta'], 0, 80));
$check('正文里不再有花括号', str_contains((string)$fixed['body'], '{') === false);

backfill_card_meta($pdo);
$again = (array)$pdo->query('SELECT body, meta FROM messages WHERE id = ' . $id)->fetch();
$check('重复跑不会二次改写', (string)$again['body'] === '[群名片] 老群名' && (string)$again['meta'] === $legacyBody);

$pdo->prepare('DELETE FROM messages WHERE id = ?')->execute([$id]);
$left = (int)$pdo->query('SELECT COUNT(*) FROM messages WHERE id = ' . $id)->fetchColumn();
$check('测试数据自清理', $left === 0);

@file_put_contents(PARLZ_DATA . '/schema.stamp', (string)md5_file(__DIR__ . '/../includes/db.php'));
$pdo->exec('ALTER TABLE messages DROP COLUMN meta');
$gone = table_has_column($pdo, 'messages', 'meta');
$code = '<?php require ' . var_export(__DIR__ . '/../includes/bootstrap.php', true) . '; db();'
    . 'echo table_has_column(db(), "messages", "meta") ? "healed" : "still-missing";' . PHP_EOL;
$child = sys_get_temp_dir() . '/parlz_child_' . getmypid() . '.php';
file_put_contents($child, $code);
$fresh = trim((string)shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($child) . ' 2>&1'));
unlink($child);
$check('stamp 说"已迁移"但列真没了 → 新进程必须自愈', $gone === false && str_contains($fresh, 'healed'), 'gone=' . var_export($gone, true) . ' child=' . $fresh);

$bad = array_values(array_filter($results, static fn ($r) => $r['ok'] !== true));
echo count($bad) === 0 ? '全部通过 (' . count($results) . ')' : '失败: ' . implode('、', array_map(static fn ($r) => $r['name'], $bad)) . PHP_EOL;
exit(count($bad) === 0 ? 0 : 1);
