<?php

require dirname(__DIR__) . '/config.php';

$base = 'http://127.0.0.1:8137';
$tmp = sys_get_temp_dir();
$pass = 0;
$fail = 0;

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

function check(string $label, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) {
        $pass++;
        echo "PASS  $label\n";
    } else {
        $fail++;
        echo "FAIL  $label" . ($detail !== '' ? "  <- $detail" : '') . "\n";
    }
}

$suffix = (string)random_int(1000, 9999);
$users = [];
$jars = [];
foreach (['calla' . $suffix, 'callb' . $suffix, 'callc' . $suffix] as $i => $name) {
    $jar = $tmp . '/parlz_' . $name . '.cookie';
    @unlink($jar);
    $jars[] = $jar;
    [$code, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => $name, 'nickname' => '通话' . chr(65 + $i), 'password' => 'parlz123'], $jar);
    $users[] = (int)($res['user']['id'] ?? 0);
}
check('注册三个通话测试账号', count(array_filter($users)) === 3, json_encode($users));
[$aId, $bId, $cId] = $users;
$jarA = $jars[0];
$jarB = $jars[1];
$jarC = $jars[2];

$anon = $tmp . '/parlz_call_anon.cookie';
@unlink($anon);
[$code, $res] = req('GET', '/api/call.php', null, $anon);
check('未登录访问通话 401', $code === 401, "code=$code");

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => $aId, 'kind' => 'audio'], $jarA);
check('呼叫自己 400', $code === 400, "code=$code");

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => 999999, 'kind' => 'audio'], $jarA);
check('呼叫不存在用户 404', $code === 404, "code=$code");

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => $bId, 'kind' => 'audio'], $jarA);
check('A 呼叫 B 成功', $code === 200 && $res['call']['status'] === 'ringing' && $res['call']['role'] === 'caller' && $res['call']['kind'] === 'audio', json_encode($res, JSON_UNESCAPED_UNICODE));
$callId = (int)($res['call']['id'] ?? 0);

[$code, $res] = req('GET', '/api/call.php', null, $jarB);
check('B 看到来电且是 ringing/callee', $code === 200 && $res['call']['role'] === 'callee' && $res['call']['status'] === 'ringing' && $res['call']['peer']['id'] === $aId, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => $cId, 'kind' => 'audio'], $jarA);
check('A 通话中再呼叫 409', $code === 409 && str_contains((string)($res['error'] ?? ''), '你正在通话中'), json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => $aId, 'kind' => 'video'], $jarC);
check('C 呼叫通话中的 A 409', $code === 409 && str_contains((string)($res['error'] ?? ''), '对方正在通话中'), json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'offer', 'id' => $callId, 'sdp' => 'v=0 fake-offer'], $jarB);
check('B 越权设置 offer 403', $code === 403, "code=$code");

[$code, $res] = req('POST', '/api/call.php', ['action' => 'offer', 'id' => $callId, 'sdp' => 'v=0 fake-offer'], $jarA);
check('A 设置 offer', $code === 200 && str_contains((string)$res['call']['offer'], 'v=0 fake-offer'), json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/call.php', null, $jarB);
check('B 读到 offer', $code === 200 && str_contains((string)$res['call']['offer'], 'v=0 fake-offer'), json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'answer', 'id' => $callId, 'sdp' => 'v=0 fake-answer'], $jarA);
check('A 越权 answer 403', $code === 403, "code=$code");

[$code, $res] = req('POST', '/api/call.php', ['action' => 'answer', 'id' => $callId, 'sdp' => 'v=0 fake-answer'], $jarB);
check('B 接听转 active', $code === 200 && $res['call']['status'] === 'active' && $res['call']['answered_at'] > 0, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'ice', 'id' => $callId, 'candidate' => ['candidate' => 'candidate:1 1 udp 1 1.2.3.4 5000 typ host', 'sdpMid' => '0', 'sdpMLineIndex' => 0]], $jarA);
check('A 上报 ICE', $code === 200, "code=$code");

[$code, $res] = req('GET', '/api/call.php', null, $jarB);
check('B 收到 A 的 ICE', $code === 200 && ($res['call']['ice'][0]['candidate'] ?? '') === 'candidate:1 1 udp 1 1.2.3.4 5000 typ host', json_encode($res['call']['ice'] ?? null, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'ice', 'id' => $callId, 'candidate' => ['candidate' => 'candidate:2 1 udp 1 5.6.7.8 6000 typ host', 'sdpMid' => '0', 'sdpMLineIndex' => 0]], $jarB);
check('B 上报 ICE', $code === 200, "code=$code");

[$code, $res] = req('GET', '/api/call.php', null, $jarA);
check('A 只看到 B 的 ICE', $code === 200 && count($res['call']['ice']) === 1 && ($res['call']['ice'][0]['candidate'] ?? '') === 'candidate:2 1 udp 1 5.6.7.8 6000 typ host', json_encode($res['call']['ice'] ?? null, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'decline', 'id' => $callId], $jarB);
check('active 状态拒接是空操作', $code === 200 && $res['call']['status'] === 'active', json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'hangup', 'id' => $callId], $jarB);
check('B 挂断转 ended', $code === 200 && $res['call']['status'] === 'ended' && $res['call']['ended_at'] > 0, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => $bId, 'kind' => 'video'], $jarA);
check('结束后可再次呼叫', $code === 200 && $res['call']['kind'] === 'video', json_encode($res, JSON_UNESCAPED_UNICODE));
$call2 = (int)($res['call']['id'] ?? 0);

[$code, $res] = req('POST', '/api/call.php', ['action' => 'decline', 'id' => $call2], $jarA);
check('主叫拒接被拒 403', $code === 403, "code=$code");

[$code, $res] = req('POST', '/api/call.php', ['action' => 'decline', 'id' => $call2], $jarB);
check('B 拒接转 declined', $code === 200 && $res['call']['status'] === 'declined', json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'answer', 'id' => $call2, 'sdp' => 'late'], $jarB);
check('已结束通话不能再接听', $code === 200 && $res['call']['status'] === 'declined', json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => $bId, 'kind' => 'audio'], $jarA);
$call3 = (int)($res['call']['id'] ?? 0);
[$code, $res] = req('POST', '/api/call.php', ['action' => 'cancel', 'id' => $call3], $jarB);
check('被叫取消被拒 403', $code === 403, "code=$code");
[$code, $res] = req('POST', '/api/call.php', ['action' => 'cancel', 'id' => $call3], $jarA);
check('A 取消转 canceled', $code === 200 && $res['call']['status'] === 'canceled', json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/call.php', ['action' => 'start', 'user_id' => $bId, 'kind' => 'audio'], $jarA);
$call4 = (int)($res['call']['id'] ?? 0);
require dirname(__DIR__) . '/includes/db.php';
db()->prepare('UPDATE calls SET created_at = ? WHERE id = ?')->execute([time() - 61, $call4]);
[$code, $res] = req('GET', '/api/call.php', null, $jarA);
check('超时未接听自动转 missed', $code === 200 && $res['call']['status'] === 'missed', json_encode($res, JSON_UNESCAPED_UNICODE));

db()->prepare('UPDATE calls SET created_at = ?, ended_at = ? WHERE id IN (?, ?, ?, ?)')->execute([time() - 120, time() - 100, $callId, $call2, $call3, $call4]);
[$code, $res] = req('GET', '/api/call.php', null, $jarB);
check('超过 30 秒的旧通话不再返回', $code === 200 && $res['call'] === null, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/poll.php?chat_id=0&after=0', null, $jarC);
check('poll 载荷带 call 字段', $code === 200 && array_key_exists('call', $res), json_encode(array_keys($res ?? [])));

$pdo = db();
$idList = implode(',', array_filter($users));
$pdo->exec('DELETE FROM calls WHERE caller_id IN (' . $idList . ') OR callee_id IN (' . $idList . ')');
$pdo->exec('DELETE FROM users WHERE id IN (' . $idList . ')');
$pdo->exec('DELETE FROM login_codes WHERE user_id IN (' . $idList . ')');
foreach (scandir(PARLZ_AVATAR_DIR) ?: [] as $entry) {
    foreach ($users as $id) {
        if ($id > 0 && str_starts_with($entry, 'g' . $id . '-')) {
            @unlink(PARLZ_AVATAR_DIR . '/' . $entry);
        }
    }
}
echo "\n清理完成: 测试账号与通话记录已删除\n";
echo "结果: {$pass} 项通过, {$fail} 项失败\n";
exit($fail === 0 ? 0 : 1);
