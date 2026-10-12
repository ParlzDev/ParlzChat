<?php

require dirname(__DIR__) . '/config.php';

$base = 'http://127.0.0.1:8137';
$tmp = sys_get_temp_dir();
$pass = 0;
$fail = 0;

function req(string $method, string $path, ?array $json, string $jar, ?array $multipart = null): array
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
        if ($multipart !== null) {
            $opts[CURLOPT_POSTFIELDS] = $multipart;
        } else {
            $opts[CURLOPT_POSTFIELDS] = json_encode($json ?? []);
            $opts[CURLOPT_HTTPHEADER] = ['Content-Type: application/json'];
        }
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
$alice = 'moma' . $suffix;
$bob = 'momb' . $suffix;
$jarA = $tmp . '/parlz_moma.cookie';
$jarB = $tmp . '/parlz_momb.cookie';
@unlink($jarA);
@unlink($jarB);

$anon = $tmp . '/parlz_mom_anon.cookie';
@unlink($anon);

[$code, $res] = req('GET', '/api/moments.php', null, $anon);
check('未登录访问动态 401', $code === 401, "code=$code");

[$code, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => $alice, 'nickname' => '动态甲', 'password' => 'parlz123'], $jarA);
check('注册用户 A', $code === 200 && ($res['user']['username'] ?? '') === $alice, json_encode($res, JSON_UNESCAPED_UNICODE));
$aId = (int)($res['user']['id'] ?? 0);
[$code, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => $bob, 'nickname' => '动态乙', 'password' => 'parlz123'], $jarB);
check('注册用户 B', $code === 200 && ($res['user']['username'] ?? '') === $bob, json_encode($res, JSON_UNESCAPED_UNICODE));
$bId = (int)($res['user']['id'] ?? 0);

[$code, $res] = req('GET', '/api/moments.php', null, $jarA);
$baseline = is_array($res['posts'] ?? null) ? count($res['posts']) : -1;
check('动态列表可读', $code === 200 && $baseline >= 0, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'add', 'body' => '', 'images' => []], $jarA);
check('空内容被拒 400', $code === 400 && str_contains((string)($res['error'] ?? ''), '写点什么'), json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'add', 'body' => '伪造图片', 'images' => ['m999-ffffffffffffffff.webp']], $jarA);
check('不存在的图片被拒 400', $code === 400, json_encode($res, JSON_UNESCAPED_UNICODE));

$png = $tmp . '/parlz_mom.png';
$img = imagecreatetruecolor(40, 40);
imagefilledrectangle($img, 0, 0, 39, 39, imagecolorallocate($img, 0, 217, 95));
imagepng($img, $png);
imagedestroy($img);
[$code, $res] = req('POST', '/api/uploads.php', null, $jarA, ['image' => new CURLFile($png, 'image/png', 'mom.png')]);
check('上传配图', $code === 200 && ($res['file'] ?? '') !== '', json_encode($res, JSON_UNESCAPED_UNICODE));
$uploaded = (string)($res['file'] ?? '');

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'add', 'body' => '第一条动态', 'images' => [$uploaded]], $jarA);
check('发布带图动态', $code === 200 && (int)($res['id'] ?? 0) > 0, json_encode($res, JSON_UNESCAPED_UNICODE));
$postId = (int)($res['id'] ?? 0);

[$code, $res] = req('GET', '/api/moments.php', null, $jarA);
$post = $res['posts'][0] ?? null;
check('动态出现在列表', is_array($post) && $post['body'] === '第一条动态' && $post['images'] === [$uploaded], json_encode($res, JSON_UNESCAPED_UNICODE));
check('发布者信息与归属', is_array($post) && $post['user']['nickname'] === '动态甲' && $post['mine'] === true && $post['liked'] === false, json_encode($post, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/moments.php', null, $jarB);
$post = $res['posts'][0] ?? null;
check('B 看到同一动态且非本人', is_array($post) && $post['mine'] === false, json_encode($post, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'like', 'id' => $postId, 'on' => true], $jarB);
check('B 点赞', $code === 200 && $res['liked'] === true && $res['count'] === 1, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/moments.php', null, $jarB);
$post = $res['posts'][0] ?? null;
check('B 视角 liked=true 且赞名单含乙', is_array($post) && $post['liked'] === true && ($post['likes'][0]['nickname'] ?? '') === '动态乙', json_encode($post, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'like', 'id' => $postId, 'on' => false], $jarB);
check('B 取消点赞', $code === 200 && $res['liked'] === false && $res['count'] === 0, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'comment', 'id' => $postId, 'body' => '写得不错'], $jarB);
check('B 发表评论', $code === 200 && ($res['comment']['body'] ?? '') === '写得不错' && ($res['comment']['user']['nickname'] ?? '') === '动态乙', json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'comment', 'id' => $postId, 'body' => '   '], $jarB);
check('空评论被拒 400', $code === 400, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/moments.php', null, $jarA);
$post = $res['posts'][0] ?? null;
check('A 视角看到评论', is_array($post) && count($post['comments']) === 1 && $post['comments'][0]['body'] === '写得不错', json_encode($post, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'remove', 'id' => $postId], $jarB);
check('B 删除 A 的动态被拒 403', $code === 403, "code=$code");

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'like', 'id' => 999999, 'on' => true], $jarB);
check('给不存在的动态点赞 404', $code === 404, "code=$code");

[$code, $res] = req('POST', '/api/moments.php', ['action' => 'remove', 'id' => $postId], $jarA);
check('A 删除自己的动态', $code === 200, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/moments.php', null, $jarA);
$ids = array_map(static fn($post) => (int)$post['id'], $res['posts'] ?? []);
check('删除后自己那条不再出现', $code === 200 && !in_array($postId, $ids, true) && count($ids) === $baseline, json_encode($ids));

require dirname(__DIR__) . '/includes/db.php';
$pdo = db();
$pdo->exec('DELETE FROM users WHERE id IN (' . $aId . ',' . $bId . ')');
$pdo->exec('DELETE FROM chats WHERE dm_key LIKE \'self-' . $aId . '\' OR dm_key LIKE \'self-' . $bId . '\'');
$pdo->exec('DELETE FROM login_codes WHERE user_id IN (' . $aId . ',' . $bId . ')');
if ($uploaded !== '' && preg_match('/^m\d+-[a-f0-9]{16}\.(webp|gif)$/', $uploaded) === 1) {
    @unlink(PARLZ_UPLOAD_DIR . '/' . $uploaded);
}
foreach (scandir(PARLZ_AVATAR_DIR) ?: [] as $entry) {
    if (str_starts_with($entry, 'g' . $aId . '-') || str_starts_with($entry, 'g' . $bId . '-')) {
        @unlink(PARLZ_AVATAR_DIR . '/' . $entry);
    }
}
@unlink($png);
echo "\n清理完成: 用户 $aId / $bId 与配图已删除\n";
echo "结果: {$pass} 项通过, {$fail} 项失败\n";
exit($fail === 0 ? 0 : 1);
