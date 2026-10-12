<?php

require dirname(__DIR__) . '/config.php';

$base = 'http://127.0.0.1:8137';
$tmp = sys_get_temp_dir();

function req(string $method, string $path, ?array $json, string $jar): array
{
    global $base;
    $ch = curl_init($base . $path);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR => $jar,
        CURLOPT_COOKIEFILE => $jar,
    ];
    if ($method === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($json ?? []);
        $opts[CURLOPT_HTTPHEADER] = ['Content-Type: application/json'];
    }
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode((string)$body, true), (string)$body];
}

$suffix = (string)random_int(1000, 9999);
$jarA = $tmp . '/parlz_fr_a.cookie';
$jarB = $tmp . '/parlz_fr_b.cookie';
@unlink($jarA);
@unlink($jarB);

[, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => 'fra' . $suffix, 'nickname' => '请求甲', 'password' => 'parlz123'], $jarA);
$aId = (int)($res['user']['id'] ?? 0);
[, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => 'frb' . $suffix, 'nickname' => '请求乙', 'password' => 'parlz123'], $jarB);
$bId = (int)($res['user']['id'] ?? 0);
echo '账号 A=' . $aId . ' B=' . $bId . PHP_EOL;

[$code, $res, $raw] = req('POST', '/api/friends.php', ['action' => 'request', 'user_id' => $bId], $jarA);
echo '1) A 发请求: code=' . $code . ' body=' . substr($raw, 0, 120) . PHP_EOL;

[$code, $res, $raw] = req('GET', '/api/friends.php', null, $jarB);
echo '2) B 拉好友接口: code=' . $code . ' body=' . substr($raw, 0, 300) . PHP_EOL;

[$code, $res, $raw] = req('GET', '/api/poll.php?chat_id=0&after=0', null, $jarB);
echo '3) B 轮询 requests 字段: ' . (isset($res['requests']) ? ('requests=' . $res['requests']) : '缺失') . ' body头部=' . substr($raw, 0, 160) . PHP_EOL;

[$code, $res, $raw] = req('GET', '/api/users.php?q=' . urlencode('fra' . $suffix), null, $jarB);
echo '4) B 搜索 A: code=' . $code . ' body=' . substr($raw, 0, 200) . PHP_EOL;

foreach ([$aId, $bId] as $id) {
    $pdo = null;
}
require dirname(__DIR__) . '/includes/db.php';
$pdo = db();
$pdo->prepare('DELETE FROM users WHERE id IN (?, ?)')->execute([$aId, $bId]);
$pdo->exec('DELETE FROM chats WHERE dm_key LIKE \'self-' . $aId . '\' OR dm_key LIKE \'self-' . $bId . '\'');
echo '已清理测试账号' . PHP_EOL;
