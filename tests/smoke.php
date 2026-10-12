<?php

require dirname(__DIR__) . '/config.php';
require dirname(__DIR__) . '/includes/link.php';

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

function html_req(string $path, string $jar): array
{
    global $base;
    $ch = curl_init($base . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_COOKIEJAR => $jar,
        CURLOPT_COOKIEFILE => $jar,
    ]);
    $raw = (string)curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return ['code' => $code, 'headers' => substr($raw, 0, $headerSize), 'body' => substr($raw, $headerSize)];
}

$suffix = (string)random_int(1000, 9999);
$alice = 'alice' . $suffix;
$bob = 'bob' . $suffix;
$jarA = $tmp . '/parlz_a.cookie';
$jarB = $tmp . '/parlz_b.cookie';
@unlink($jarA);
@unlink($jarB);

$root = html_req('/', $jarA);
check('访问根路径跳转 ?chat', $root['code'] === 302 && str_contains($root['headers'], 'index.php?chat'), 'code=' . $root['code']);

[$code, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => $alice, 'nickname' => '爱丽丝', 'password' => 'parlz123'], $jarA);
check('注册用户 A', $code === 200 && ($res['user']['username'] ?? '') === $alice, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/auth.php', null, $jarA);
check('会话回读用户 A', $code === 200 && ($res['user']['username'] ?? '') === $alice);

[$code, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => $alice, 'nickname' => 'x', 'password' => 'parlz123'], $jarA);
check('重复用户名返回 409', $code === 409, "code=$code");

[$code, $res] = req('POST', '/api/auth.php', ['action' => 'login', 'username' => $alice, 'password' => 'wrong-pass'], $jarA);
check('错误密码返回 401', $code === 401, "code=$code");

[$code, $res] = req('POST', '/api/auth.php', ['action' => 'register', 'username' => $bob, 'nickname' => 'Bob', 'password' => 'parlz123'], $jarB);
check('注册用户 B', $code === 200 && ($res['user']['username'] ?? '') === $bob);

[$code, $res] = req('GET', '/api/chats.php', null, $jarB);
$lobby = null;
foreach ($res['chats'] ?? [] as $chat) {
    if (!empty($chat['is_default'])) {
        $lobby = $chat;
    }
}
check('B 自动加入默认群 Parlz 广场', $lobby !== null && $lobby['members'] >= 2, json_encode($res['chats'] ?? [], JSON_UNESCAPED_UNICODE));

$bobId = 0;
[$code, $res] = req('GET', '/api/friends.php?q=' . urlencode('Bob'), null, $jarA);
foreach ($res['results'] ?? [] as $row) {
    if ($row['username'] === $bob) {
        $bobId = (int)$row['id'];
    }
}
check('A 搜索到 B 且关系为 none', $bobId > 0 && ($row['relation'] ?? '') === 'none', json_encode($res ?? [], JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/friends.php', ['action' => 'request', 'user_id' => $bobId], $jarA);
check('A 发起好友申请', $code === 200 && $res['accepted'] === false, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/friends.php', null, $jarB);
check('B 收到好友请求', count($res['requests'] ?? []) === 1);

[$code, $res] = req('POST', '/api/friends.php', ['action' => 'accept', 'user_id' => $res['requests'][0]['id']], $jarB);
check('B 接受好友', $code === 200);

[$code, $res] = req('GET', '/api/friends.php', null, $jarA);
check('A 好友列表出现 B', count($res['friends'] ?? []) === 1 && $res['friends'][0]['username'] === $bob);

[$code, $res] = req('GET', '/api/users.php?id=' . $bobId, null, $jarA);
check('A 读取 B 的公开资料且关系为 friend', $code === 200 && ($res['user']['relation'] ?? '') === 'friend' && (int)($res['user']['stats']['friends'] ?? 0) >= 1, json_encode($res ?? [], JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/users.php?id=' . $bobId, null, $jarB);
check('自己看自己关系为 self', ($res['user']['relation'] ?? '') === 'self');

[$code, $res] = req('GET', '/api/users.php?id=999999', null, $jarA);
check('不存在的用户返回 404', $code === 404, "code=$code");

[$code, $res] = req('GET', '/api/users.php?id=' . $bobId, null, $jarA . '.anon');
check('未登录读取用户资料返回 401', $code === 401, "code=$code");

[$code, $res] = req('POST', '/api/chats.php', ['action' => 'open', 'user_id' => $bobId], $jarA);
$dmId = (int)($res['chat_id'] ?? 0);
check('A 打开与 B 的私聊', $code === 200 && $dmId > 0, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'body' => '你好 Bob <script>alert(1)</script>'], $jarA);
$firstId = (int)($res['message']['id'] ?? 0);
check('A 发送私聊消息', $code === 200 && $firstId > 0);

[$code, $res] = req('GET', '/api/poll.php?chat_id=' . $dmId . '&after=0', null, $jarB);
check('B 轮询收到私聊消息', count($res['messages'] ?? []) === 1 && $res['messages'][0]['body'] === '你好 Bob <script>alert(1)</script>');

[$code, $res] = req('GET', '/api/chats.php', null, $jarB);
$dmChat = null;
foreach ($res['chats'] ?? [] as $chat) {
    if ((int)$chat['id'] === $dmId) {
        $dmChat = $chat;
    }
}
check('B 会话列表未读计数为 1', $dmChat !== null && (int)$dmChat['unread'] === 1, json_encode($dmChat, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/chats.php', ['action' => 'read', 'chat_id' => $dmId, 'last_id' => $firstId], $jarB);
check('B 标记已读', $code === 200);
[$code, $res] = req('GET', '/api/chats.php', null, $jarB);
foreach ($res['chats'] ?? [] as $chat) {
    if ((int)$chat['id'] === $dmId) {
        $dmChat = $chat;
    }
}
check('已读后未读归零', (int)$dmChat['unread'] === 0);

[$code, $res] = req('POST', '/api/groups.php', ['action' => 'create', 'name' => 'Parlz 测试群', 'member_ids' => [$bobId]], $jarA);
$groupId = (int)($res['chat_id'] ?? 0);
check('A 建群并邀请 B', $code === 200 && $groupId > 0 && $res['invited'] === 1, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/api/messages.php?chat_id=' . $groupId, null, $jarB);
check('B 在群里看到系统消息', $code === 200 && ($res['messages'][0]['kind'] ?? '') === 'system');

[$code, $res] = req('GET', '/api/groups.php?action=info&chat_id=' . $groupId, null, $jarA);
check('群成员 2 人且 A 是群主', count($res['group']['members'] ?? []) === 2 && ($res['group']['is_owner'] ?? false) === true);

[$code, $res] = req('POST', '/api/groups.php', ['action' => 'rename', 'chat_id' => $groupId, 'name' => '改名后的群'], $jarA);
check('群主改群名', $code === 200 && $res['name'] === '改名后的群');

[$code, $res] = req('POST', '/api/groups.php', ['action' => 'rename', 'chat_id' => $groupId, 'name' => '越权改名'], $jarB);
check('非群主改名被拒 403', $code === 403, "code=$code");

[$code, $res] = req('POST', '/api/groups.php', ['action' => 'leave', 'chat_id' => $groupId], $jarB);
check('B 退出群聊', $code === 200);
[$code, $res] = req('GET', '/api/groups.php?action=info&chat_id=' . $groupId, null, $jarA);
check('群成员剩 1 人', count($res['group']['members'] ?? []) === 1);

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $groupId, 'body' => ''], $jarA);
check('空消息被拒 400', $code === 400, "code=$code");

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $groupId, 'body' => str_repeat('长', 2001)], $jarA);
check('超长消息被拒 400', $code === 400, "code=$code");

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'body' => 'smile', 'kind' => 'sticker'], $jarA);
check('发送 SVG 表情 kind=sticker', $code === 200 && ($res['message']['kind'] ?? '') === 'sticker' && ($res['message']['body'] ?? '') === 'smile', json_encode($res ?? [], JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'body' => 'evil_script', 'kind' => 'sticker'], $jarA);
check('未知表情名被拒 400', $code === 400, "code=$code");

[$code, $res] = req('GET', '/api/poll.php?chat_id=' . $dmId . '&after=0', null, $jarB);
$stickerSeen = false;
foreach ($res['messages'] ?? [] as $message) {
    if ($message['kind'] === 'sticker' && $message['body'] === 'smile') {
        $stickerSeen = true;
    }
}
check('轮询能把表情传给对方', $stickerSeen);

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'body' => 'melon', 'kind' => 'sticker'], $jarA);
check('新增表情 melon 在白名单内', $code === 200);

$chatImage = $tmp . '/parlz_chat_image.png';
$png2 = imagecreatetruecolor(300, 200);
imagefill($png2, 0, 0, imagecolorallocate($png2, 0, 200, 90));
imagepng($png2, $chatImage);
imagedestroy($png2);

[$code, $res] = req('POST', '/api/uploads.php', null, $jarA, ['image' => new CURLFile($chatImage, 'image/png', 'pic.png')]);
$uploaded = (string)($res['file'] ?? '');
check('上传聊天图片', $code === 200 && preg_match('/^m\d+-[a-f0-9]{16}\.webp$/', $uploaded) === 1, json_encode($res, JSON_UNESCAPED_UNICODE));
check('聊天图片落盘 assets/uploads', is_file(dirname(__DIR__) . '/assets/uploads/' . $uploaded));

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'body' => $uploaded, 'kind' => 'image'], $jarA);
check('发送图片消息 kind=image', $code === 200 && ($res['message']['kind'] ?? '') === 'image');

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'body' => 'm1-deadbeefdeadbeef.webp', 'kind' => 'image'], $jarA);
check('不存在的图片被拒 400', $code === 400, "code=$code");

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'body' => '撤回测试', 'kind' => 'text'], $jarA);
$recallId = (int)($res['message']['id'] ?? 0);
[$code, $res] = req('POST', '/api/messages.php', ['action' => 'recall', 'id' => $recallId], $jarB);
check('不能撤回别人的消息 403', $code === 403, "code=$code");
[$code, $res] = req('POST', '/api/messages.php', ['action' => 'recall', 'id' => $recallId], $jarA);
check('撤回自己的消息', $code === 200 && ($res['id'] ?? 0) === $recallId, json_encode($res, JSON_UNESCAPED_UNICODE));
[$code, $res] = req('GET', '/api/poll.php?chat_id=' . $dmId . '&after=0', null, $jarB);
check('轮询能拿到撤回列表', in_array($recallId, array_map('intval', $res['recalled'] ?? []), true));

[$code, $res] = req('POST', '/api/groups.php', ['action' => 'create', 'name' => '头像群', 'member_ids' => [$bobId]], $jarA);
$avatarGroup = (int)($res['chat_id'] ?? 0);
[$code, $res] = req('POST', '/api/groups.php', null, $jarA, ['action' => 'avatar', 'chat_id' => (string)$avatarGroup, 'avatar' => new CURLFile($chatImage, 'image/png', 'g.png')]);
$groupAvatar = (string)($res['avatar'] ?? '');
check('群主更换群头像', $code === 200 && preg_match('/^g\d+-[a-f0-9]+\.webp$/', $groupAvatar) === 1, json_encode($res, JSON_UNESCAPED_UNICODE));
[$code, $res] = req('POST', '/api/groups.php', null, $jarB, ['action' => 'avatar', 'chat_id' => (string)$avatarGroup, 'avatar' => new CURLFile($chatImage, 'image/png', 'g.png')]);
check('非群主换群头像被拒 403', $code === 403, "code=$code");
[$code, $res] = req('GET', '/api/groups.php?action=info&chat_id=' . $avatarGroup, null, $jarA);
check('群信息回读群头像', ($res['group']['avatar'] ?? '') === $groupAvatar, json_encode($res['group'] ?? [], JSON_UNESCAPED_UNICODE));

$mergedPayload = json_encode([
    'title' => 'Parlz 广场的聊天记录',
    'items' => [
        ['name' => '爱丽丝', 'kind' => 'text', 'body' => '你好呀', 'at' => time()],
        ['name' => '爱丽丝', 'kind' => 'sticker', 'body' => 'smile', 'at' => time()],
        ['name' => '爱丽丝', 'kind' => 'image', 'body' => $uploaded, 'at' => time()],
        ['name' => '爱丽丝', 'kind' => 'image', 'body' => 'm1-notarealfile00.webp', 'at' => time()],
    ],
], JSON_UNESCAPED_UNICODE);
[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'kind' => 'merged', 'body' => $mergedPayload], $jarA);
check('发送合并转发（聊天记录卡片）', $code === 200 && ($res['message']['kind'] ?? '') === 'merged', json_encode($res ?? [], JSON_UNESCAPED_UNICODE));
$storedMerged = json_decode((string)($res['message']['body'] ?? '[]'), true);
check('聊天记录落库为规范化 JSON', ($storedMerged['title'] ?? '') === 'Parlz 广场的聊天记录' && count($storedMerged['items'] ?? []) === 4, json_encode($storedMerged, JSON_UNESCAPED_UNICODE));
check('非法图片项降级为文本 [图片]', ($storedMerged['items'][3]['kind'] ?? '') === 'text' && ($storedMerged['items'][3]['body'] ?? '') === '[图片]');

[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'kind' => 'merged', 'body' => 'not-json'], $jarA);
check('非法聊天记录被拒 400', $code === 400, "code=$code");
[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'kind' => 'merged', 'body' => json_encode(['title' => '空的', 'items' => []])], $jarA);
check('空的聊天记录被拒 400', $code === 400, "code=$code");

$nestedPayload = json_encode([
    'title' => '外层记录',
    'items' => [
        [
            'name' => '甲',
            'uid' => 'U00001',
            'kind' => 'merged',
            'body' => json_encode(['title' => '内层记录', 'items' => [['name' => '乙', 'kind' => 'text', 'body' => '内层消息', 'at' => time()]]], JSON_UNESCAPED_UNICODE),
            'at' => time(),
        ],
        ['name' => '甲', 'uid' => 'U00001', 'kind' => 'text', 'body' => '保留我', 'at' => time()],
    ],
], JSON_UNESCAPED_UNICODE);
[$code, $res] = req('POST', '/api/messages.php', ['chat_id' => $dmId, 'kind' => 'merged', 'body' => $nestedPayload], $jarA);
$nestedStored = json_decode((string)($res['message']['body'] ?? '[]'), true);
$nestedInner = json_decode((string)($nestedStored['items'][0]['body'] ?? '[]'), true);
check('嵌套的聊天记录条目保留为卡片', $code === 200 && count($nestedStored['items'] ?? []) === 2 && ($nestedStored['items'][0]['kind'] ?? '') === 'merged', json_encode($nestedStored ?? [], JSON_UNESCAPED_UNICODE));
check('内层记录内容完整保留', ($nestedInner['title'] ?? '') === '内层记录' && ($nestedInner['items'][0]['body'] ?? '') === '内层消息', json_encode($nestedInner ?? [], JSON_UNESCAPED_UNICODE));
[$code, $res] = req('GET', '/api/messages.php?chat_id=' . $dmId, null, $jarB);
$mergedSeen = false;
foreach ($res['messages'] ?? [] as $message) {
    if ($message['kind'] === 'merged') {
        $mergedSeen = true;
    }
}
check('对方能收到合并转发的卡片', $mergedSeen);

[$code, $res] = req('POST', '/api/groups.php', ['action' => 'leave', 'chat_id' => $groupId], $jarA);
check('默认群外的群可退出', $code === 200);

[$code, $res] = req('GET', '/api/poll.php', null, $jarA . '.none');
check('未登录访问 poll 返回 401', $code === 401, "code=$code");

[$code, $res] = req('POST', '/api/profile.php', ['action' => 'update', 'nickname' => '绿黑爱好者', 'bio' => 'Parlz 纯色党'], $jarA);
check('A 更新昵称与签名', $code === 200 && ($res['user']['nickname'] ?? '') === '绿黑爱好者');

$png = imagecreatetruecolor(300, 200);
imagefill($png, 0, 0, imagecolorallocate($png, 0, 255, 106));
$pngFile = $tmp . '/parlz_avatar.png';
imagepng($png, $pngFile);
imagedestroy($png);
[$code, $res] = req('POST', '/api/profile.php', null, $jarA, ['action' => 'avatar', 'avatar' => new CURLFile($pngFile, 'image/png', 'avatar.png')]);
check('A 上传头像', $code === 200 && ($res['avatar'] ?? '') !== '', json_encode($res, JSON_UNESCAPED_UNICODE));
$avatarFile = dirname(__DIR__) . '/assets/avatars/' . ($res['avatar'] ?? 'none');
check('头像文件落盘 assets/avatars', is_file($avatarFile), $avatarFile);

$txtFile = $tmp . '/parlz_fake.png';
file_put_contents($txtFile, 'not an image at all');
[$code, $res] = req('POST', '/api/profile.php', null, $jarA, ['action' => 'avatar', 'avatar' => new CURLFile($txtFile, 'image/png', 'fake.png')]);
check('伪装图片被拒 400', $code === 400, "code=$code " . json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/profile.php', ['action' => 'password', 'current' => 'wrong', 'password' => 'newpass123'], $jarA);
check('错误的当前密码被拒 403', $code === 403, "code=$code");

[$code, $res] = req('POST', '/api/profile.php', ['action' => 'password', 'current' => 'parlz123', 'password' => 'newpass123'], $jarA);
check('修改密码', $code === 200);

[$code, $res] = req('POST', '/api/auth.php', ['action' => 'logout'], $jarA);
check('退出登录', $code === 200);
[$code, $res] = req('GET', '/api/auth.php', null, $jarA);
check('退出后会话为空', $code === 200 && array_key_exists('user', $res) && $res['user'] === null, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('POST', '/api/auth.php', ['action' => 'login', 'username' => $alice, 'password' => 'newpass123'], $jarA);
check('新密码可登录', $code === 200);

$anon = $tmp . '/parlz_anon.cookie';
@unlink($anon);
$page = html_req('/?chat', $anon);
check('未登录访问 ?chat 跳转 ?login', $page['code'] === 302 && str_contains($page['headers'], 'index.php?login'), 'code=' . $page['code']);
$page = html_req('/?register', $anon);
check('未登录可打开 ?register', $page['code'] === 200 && str_contains($page['body'], 'register-form'), 'code=' . $page['code']);
$page = html_req('/?login', $jarA);
check('已登录访问 ?login 跳回 ?chat', $page['code'] === 302 && str_contains($page['headers'], 'index.php?chat'), 'code=' . $page['code']);
$page = html_req('/?chat', $jarA);
check('登录后 ?chat 返回应用外壳', $page['code'] === 200 && str_contains($page['body'], 'chat-view') && str_contains($page['body'], 'page-view'), 'code=' . $page['code']);
$page = html_req('/?contact', $jarA);
check('?contact 返回应用外壳', $page['code'] === 200 && str_contains($page['body'], 'data-view="contact"'));
$page = html_req('/?setting', $jarA);
check('?setting 返回设置页外壳', $page['code'] === 200 && str_contains($page['body'], '"name":"setting"'));
$page = html_req('/?moments', $jarA);
check('?moments 返回动态广场外壳', $page['code'] === 200 && str_contains($page['body'], '"name":"moments"') && str_contains($page['body'], 'data-view="moments"'));
$page = html_req('/?profile&id=' . $bobId, $jarA);
check('?profile&id 返回资料页外壳', $page['code'] === 200 && str_contains($page['body'], '"name":"profile"'));
$page = html_req('/?whatever', $jarA);
check('未识别的查询串也跳转 ?chat', $page['code'] === 302 && str_contains($page['headers'], 'index.php?chat'), 'code=' . $page['code']);

$sample = '<html><head><title>备用标题</title>'
    . '<meta property="og:title" content="Parlz 链接卡片测试">'
    . '<meta property="og:description" content="这是一段描述 &amp; 实体">'
    . '<meta property="og:image" content="/img/cover.png">'
    . '<meta property="og:site_name" content="示例站点">'
    . '</head><body></body></html>';
$card = link_parse_html('https://example.com/post/1', $sample);
check('OG 解析标题/描述/站点', $card['title'] === 'Parlz 链接卡片测试' && $card['description'] === '这是一段描述 & 实体' && $card['site'] === '示例站点', json_encode($card, JSON_UNESCAPED_UNICODE));
check('OG 相对图片补成绝对地址', $card['image'] === 'https://example.com/img/cover.png', $card['image']);
$fallback = link_parse_html('https://example.com/a/b', '<html><head><title>只有 title</title></head></html>');
check('无 OG 时退回 <title>', $fallback['title'] === '只有 title' && $fallback['site'] === 'example.com');
check('私有地址被拒绝', link_host_allowed('http://127.0.0.1/x') === false && link_host_allowed('http://10.1.2.3/') === false && link_host_allowed('http://192.168.1.1/') === false && link_host_allowed('http://localhost/') === false);
check('非 http 协议被拒绝', link_host_allowed('file:///etc/passwd') === false && link_normalize('javascript:alert(1)') === '' && link_normalize('ftp://x/y') === '');

$anonLink = $tmp . '/parlz_anon2.cookie';
@unlink($anonLink);
[$code, $res] = req('GET', '/api/link.php?url=' . urlencode('https://example.com/'), null, $anonLink);
check('未登录访问链接解析返回 401', $code === 401, "code=$code");
[$code, $res] = req('GET', '/api/link.php?url=' . urlencode('javascript:alert(1)'), null, $jarA);
check('非法协议被拒 400', $code === 400, "code=$code");
[$code, $res] = req('GET', '/api/link.php?url=' . urlencode('http://127.0.0.1:8137/'), null, $jarA);
check('内网地址解析返回空卡片（不抓取）', $code === 200 && array_key_exists('card', $res) && $res['card'] === null, json_encode($res, JSON_UNESCAPED_UNICODE));

[$code, $res] = req('GET', '/assets/style/base.css', null, $jarA);
check('CSS 可访问', $code === 200);

[$code, $res] = req('GET', '/data/parlz.sqlite', null, $jarA);
check('数据库文件被拦截 404', $code === 404, "code=$code");

[$code, $res] = req('GET', '/assets/../config.php', null, $jarA);
check('路径穿越被拦截', $code === 400 || $code === 404, "code=$code");

echo "\n结果: {$pass} 项通过, {$fail} 项失败\n";
exit($fail === 0 ? 0 : 1);
