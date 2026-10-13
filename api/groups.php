<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/image.php';

$user = require_user();
$uid = (int)$user['id'];
$pdo = db();

function group_ids_from(array $raw): array
{
    $ids = [];
    foreach ((array)$raw as $value) {
        if (is_numeric($value) && (int)$value > 0) {
            $ids[(int)$value] = true;
        }
    }
    return array_keys($ids);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $action = (string)($_GET['action'] ?? 'list');

    if ($action === 'info') {
        $chatId = (int)($_GET['chat_id'] ?? 0);
        $chat = member_chat($chatId, $uid);
        if ($chat['type'] !== 'group') {
            fail('这不是群聊', 400);
        }
        $manager = is_chat_manager($chat, $uid);
        $state = member_state($chatId, $uid);
        $invites = [];
        $stmt = $pdo->prepare('SELECT gi.id, gi.created_at, gi.inviter_id, gi.invitee_id,
                ui.nickname AS inviter_name, ue.nickname AS invitee_name
            FROM group_invites gi
            JOIN users ui ON ui.id = gi.inviter_id
            JOIN users ue ON ue.id = gi.invitee_id
            WHERE gi.chat_id = ? AND gi.status = \'pending\'' . ($manager ? '' : ' AND gi.inviter_id = ?') . '
            ORDER BY gi.id ASC LIMIT 50');
        $stmt->execute($manager ? [$chatId] : [$chatId, $uid]);
        foreach ($stmt->fetchAll() as $row) {
            $invites[] = [
                'id' => (int)$row['id'],
                'inviter_id' => (int)$row['inviter_id'],
                'inviter_name' => $row['inviter_name'],
                'invitee_id' => (int)$row['invitee_id'],
                'invitee_name' => $row['invitee_name'],
                'created_at' => (int)$row['created_at'],
            ];
        }
        $files = [];
        $fileStmt = $pdo->prepare('SELECT m.body, m.created_at, COALESCE(NULLIF(cm.nickname, \'\'), u.nickname) AS sender
            FROM messages m
            JOIN users u ON u.id = m.user_id
            LEFT JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = m.user_id
            WHERE m.chat_id = ? AND m.kind = \'file\'
            ORDER BY m.id DESC LIMIT 100');
        $fileStmt->execute([$chatId]);
        foreach ($fileStmt->fetchAll() as $row) {
            $decoded = json_decode((string)$row['body'], true);
            if (!is_array($decoded) || !isset($decoded['file'])) {
                continue;
            }
            $files[] = [
                'file' => (string)$decoded['file'],
                'name' => (string)($decoded['name'] ?? '文件'),
                'size' => max(0, (int)($decoded['size'] ?? 0)),
                'sender' => (string)$row['sender'],
                'created_at' => (int)$row['created_at'],
            ];
        }
        json_out([
            'ok' => true,
            'group' => [
                'id' => (int)$chat['id'],
                'uid' => group_uid((int)$chat['id']),
                'name' => $chat['name'],
                'avatar' => (string)$chat['avatar'],
                'notice' => (string)($chat['notice'] ?? ''),
                'owner_id' => (int)$chat['owner_id'],
                'is_default' => (bool)$chat['is_default'],
                'search_mode' => (string)($chat['search_mode'] ?? 'both'),
                'join_mode' => (string)($chat['join_mode'] ?? 'verify'),
                'is_owner' => (int)$chat['owner_id'] === $uid,
                'is_manager' => $manager,
                'my_role' => $state === null ? 'member' : $state['role'],
                'my_nick' => $state === null ? '' : $state['nickname'],
                'created_at' => (int)$chat['created_at'],
                'members' => group_members($chatId),
                'invites' => $invites,
                'files' => $files,
            ],
        ]);
    }

    $stmt = $pdo->prepare('SELECT c.id, c.name, c.avatar, c.owner_id, c.is_default, c.created_at,
            (SELECT COUNT(*) FROM chat_members x WHERE x.chat_id = c.id) AS members
        FROM chats c JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
        WHERE c.type = \'group\'
        ORDER BY c.is_default DESC, c.id ASC');
    $stmt->execute([$uid]);
    $groups = [];
    foreach ($stmt->fetchAll() as $row) {
        $groups[] = [
            'id' => (int)$row['id'],
            'uid' => group_uid((int)$row['id']),
            'name' => $row['name'],
            'avatar' => (string)$row['avatar'],
            'owner_id' => (int)$row['owner_id'],
            'is_default' => (bool)$row['is_default'],
            'is_owner' => (int)$row['owner_id'] === $uid,
            'members' => (int)$row['members'],
            'created_at' => (int)$row['created_at'],
        ];
    }
    json_out(['ok' => true, 'groups' => $groups]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'settings') {
    $chatId = int_field($data, 'chat_id', '群聊');
    $chat = member_chat($chatId, $uid);
    if ($chat['type'] !== 'group') {
        fail('这不是群聊', 400);
    }
    if (!is_chat_manager($chat, $uid)) {
        fail('只有群主和管理员能改这些设置', 403);
    }
    $searchMode = (string)($data['search_mode'] ?? '');
    $joinMode = (string)($data['join_mode'] ?? '');
    if (!in_array($searchMode, ['private', 'uid', 'keyword', 'both'], true)) {
        fail('搜索方式不对');
    }
    if (!in_array($joinMode, ['none', 'verify', 'open'], true)) {
        fail('加群方式不对');
    }
    db_write(static function () use ($pdo, $chatId, $searchMode, $joinMode): void {
        $pdo->prepare('UPDATE chats SET search_mode = ?, join_mode = ? WHERE id = ?')->execute([$searchMode, $joinMode, $chatId]);
    });
    json_out(['ok' => true, 'search_mode' => $searchMode, 'join_mode' => $joinMode]);
}

if ($action === 'search') {
    rate_guard('group_search', (string)$uid, 60, 600);
    $query = trim((string)($data['q'] ?? ''));
    if (mb_strlen($query) < 2) {
        json_out(['ok' => true, 'groups' => []]);
    }
    $like = '%' . $query . '%';
    $uidQuery = strtoupper($query);
    $stmt = $pdo->prepare('SELECT c.id, c.name, c.avatar, c.search_mode, c.join_mode, c.owner_id,
            (SELECT COUNT(*) FROM chat_members x WHERE x.chat_id = c.id) AS members,
            (SELECT COUNT(*) FROM chat_members y WHERE y.chat_id = c.id AND y.user_id = ?) AS joined,
            (SELECT COUNT(*) FROM group_invites gi WHERE gi.chat_id = c.id AND gi.invitee_id = ? AND gi.status = \'pending\') AS pending
        FROM chats c
        WHERE c.type = \'group\' AND c.is_default = 0
          AND (
            (c.search_mode IN (\'keyword\', \'both\') AND c.name LIKE ?)
            OR (c.search_mode IN (\'uid\', \'both\') AND c.id = ?)
          )
        ORDER BY c.id DESC LIMIT 20');
    $stmt->execute([$uid, $uid, $like, group_id_from_uid($uidQuery)]);
    $groups = [];
    foreach ($stmt->fetchAll() as $row) {
        $groups[] = [
            'id' => (int)$row['id'],
            'uid' => group_uid((int)$row['id']),
            'name' => $row['name'],
            'avatar' => (string)$row['avatar'],
            'members' => (int)$row['members'],
            'joined' => (int)$row['joined'] > 0,
            'pending' => (int)$row['pending'] > 0,
            'join_mode' => (string)$row['join_mode'],
        ];
    }
    json_out(['ok' => true, 'groups' => $groups]);
}

if ($action === 'join') {
    rate_guard('group_join', (string)$uid, 30, 600);
    $chatId = int_field($data, 'chat_id', '群聊');
    $stmt = $pdo->prepare('SELECT id, type, name, is_default, join_mode FROM chats WHERE id = ?');
    $stmt->execute([$chatId]);
    $chat = $stmt->fetch();
    if ($chat === false || (string)$chat['type'] !== 'group') {
        fail('群不存在', 404);
    }
    $stmt = $pdo->prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?');
    $stmt->execute([$chatId, $uid]);
    if ($stmt->fetchColumn() !== false) {
        json_out(['ok' => true, 'joined' => true, 'chat_id' => $chatId]);
    }
    $joinMode = (string)($chat['join_mode'] ?? 'verify');
    if ($joinMode === 'none') {
        fail('这个群不允许加入');
    }
    if ($joinMode === 'open') {
        $joined = join_chat($chatId, $uid);
        json_out(['ok' => true, 'joined' => true, 'chat_id' => $joined]);
    }
    db_write(static function () use ($pdo, $chatId, $uid): void {
        $pdo->prepare('INSERT OR IGNORE INTO group_invites (chat_id, inviter_id, invitee_id, status, created_at) VALUES (?, ?, ?, \'pending\', ?)')
            ->execute([$chatId, $uid, $uid, time()]);
    });
    json_out(['ok' => true, 'joined' => false, 'pending' => true]);
}

if ($action === 'create') {
    $name = field($data, 'name', 30, '群名称');
    $memberIds = [];
    foreach (group_ids_from($data['member_ids'] ?? []) as $memberId) {
        if ($memberId === $uid || !are_friends($uid, $memberId)) {
            continue;
        }
        $memberIds[] = $memberId;
    }

    $pdo->prepare('INSERT INTO chats (type, name, dm_key, owner_id, created_at) VALUES (\'group\', ?, NULL, ?, ?)')
        ->execute([$name, $uid, time()]);
    $chatId = (int)$pdo->lastInsertId();
    join_chat($chatId, $uid);
    foreach ($memberIds as $memberId) {
        join_chat($chatId, $memberId);
    }
    push_message($chatId, $uid, $user['nickname'] . ' 创建了群聊「' . $name . '」', 'system');

    json_out(['ok' => true, 'chat_id' => $chatId, 'invited' => count($memberIds)]);
}

$chatId = int_field($data, 'chat_id', '会话');
$chat = member_chat($chatId, $uid);
if ($chat['type'] !== 'group') {
    fail('这不是群聊', 400);
}

if ($action === 'avatar') {
    if ((int)$chat['owner_id'] !== $uid && (int)$chat['is_default'] !== 1) {
        fail('只有群主可以更换群头像', 403);
    }
    $file = $_FILES['avatar'] ?? null;
    $tmp = is_array($file) ? (string)($file['tmp_name'] ?? '') : '';
    $info = is_uploaded_file($tmp) ? @getimagesize($tmp) : false;
    if ($info !== false && (int)($info[2] ?? 0) === IMAGETYPE_GIF) {
        if ((int)($file['size'] ?? 0) > 2 * 1024 * 1024) {
            fail('头像不能超过 2MB');
        }
        if (!is_dir(PARLZ_AVATAR_DIR) && !mkdir(PARLZ_AVATAR_DIR, 0775, true) && !is_dir(PARLZ_AVATAR_DIR)) {
            fail('无法创建头像目录 assets/avatars');
        }
        $gifName = 'g' . $chatId . '-' . bin2hex(random_bytes(6)) . '.gif';
        if (!move_uploaded_file($tmp, PARLZ_AVATAR_DIR . '/' . $gifName)) {
            fail('群头像保存失败，请检查 assets/avatars 目录写入权限');
        }
        $oldGif = (string)$chat['avatar'];
        if ($oldGif !== '' && preg_match('/^g' . $chatId . '-[a-f0-9]+\.(webp|gif)$/', $oldGif) === 1) {
            @unlink(PARLZ_AVATAR_DIR . '/' . $oldGif);
        }
        db()->prepare('UPDATE chats SET avatar = ? WHERE id = ?')->execute([$gifName, $chatId]);
        json_out(['ok' => true, 'avatar' => $gifName]);
    }
    $image = image_receive('avatar');
    if (!is_dir(PARLZ_AVATAR_DIR) && !mkdir(PARLZ_AVATAR_DIR, 0775, true) && !is_dir(PARLZ_AVATAR_DIR)) {
        fail('无法创建头像目录 assets/avatars');
    }
    $name = 'g' . $chatId . '-' . bin2hex(random_bytes(6)) . '.webp';
    $saved = image_save_webp($image, PARLZ_AVATAR_DIR . '/' . $name, 192, 88, true);
    imagedestroy($image);
    if ($saved === false) {
        fail('群头像保存失败，请检查 assets/avatars 目录写入权限');
    }
    $old = (string)$chat['avatar'];
    if ($old !== '' && preg_match('/^g' . $chatId . '-[a-f0-9]+\.(webp|gif)$/', $old) === 1) {
        @unlink(PARLZ_AVATAR_DIR . '/' . $old);
    }
    db()->prepare('UPDATE chats SET avatar = ? WHERE id = ?')->execute([$name, $chatId]);
    json_out(['ok' => true, 'avatar' => $name]);
}

if ($action === 'rename') {
    if ((int)$chat['owner_id'] !== $uid && (int)$chat['is_default'] !== 1) {
        fail('只有群主可以修改群名称', 403);
    }
    $name = field($data, 'name', 30, '群名称');
    $pdo->prepare('UPDATE chats SET name = ? WHERE id = ?')->execute([$name, $chatId]);
    json_out(['ok' => true, 'name' => $name]);
}

if ($action === 'notice') {
    if (!is_chat_manager($chat, $uid)) {
        fail('只有群主或管理员可以修改群公告', 403);
    }
    $notice = mb_substr(trim((string)($data['notice'] ?? '')), 0, 200);
    $pdo->prepare('UPDATE chats SET notice = ? WHERE id = ?')->execute([$notice, $chatId]);
    json_out(['ok' => true, 'notice' => $notice]);
}

if ($action === 'nick') {
    $nick = mb_substr(trim((string)($data['nickname'] ?? '')), 0, 16);
    $pdo->prepare('UPDATE chat_members SET nickname = ? WHERE chat_id = ? AND user_id = ?')->execute([$nick, $chatId, $uid]);
    json_out(['ok' => true, 'nickname' => $nick]);
}

if ($action === 'admin') {
    if ((int)$chat['owner_id'] !== $uid && (int)$chat['is_default'] !== 1) {
        fail('只有群主可以设置管理员', 403);
    }
    $target = int_field($data, 'user_id', '成员');
    if ($target === $uid) {
        fail('不能设置自己为管理员');
    }
    if ((int)$chat['owner_id'] === $target) {
        fail('群主无需设置');
    }
    $state = member_state($chatId, $target);
    if ($state === null) {
        fail('对方不在群里', 404);
    }
    $role = $state['role'] === 'admin' ? 'member' : 'admin';
    $pdo->prepare('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?')->execute([$role, $chatId, $target]);
    $stmt = $pdo->prepare('SELECT nickname FROM users WHERE id = ?');
    $stmt->execute([$target]);
    $targetName = (string)$stmt->fetchColumn();
    push_message($chatId, $uid, $targetName . ($role === 'admin' ? ' 被设为管理员' : ' 被取消管理员'), 'system');
    json_out(['ok' => true, 'role' => $role]);
}

if ($action === 'mute') {
    $target = int_field($data, 'user_id', '成员');
    $minutes = max(0, min(43200, (int)($data['minutes'] ?? 0)));
    if ($target === $uid) {
        fail('不能禁言自己');
    }
    $state = member_state($chatId, $target);
    if ($state === null) {
        fail('对方不在群里', 404);
    }
    $isOwner = (int)$chat['owner_id'] === $uid || (int)$chat['is_default'] === 1;
    $myState = member_state($chatId, $uid);
    $isAdmin = !$isOwner && $myState !== null && $myState['role'] === 'admin';
    if (!$isOwner && !$isAdmin) {
        fail('只有群主或管理员可以禁言', 403);
    }
    if (!$isOwner && $state['role'] !== 'member') {
        fail('管理员不能禁言其他管理员', 403);
    }
    if ((int)$chat['owner_id'] === $target) {
        fail('不能禁言群主', 403);
    }
    $until = $minutes > 0 ? time() + $minutes * 60 : 0;
    $pdo->prepare('UPDATE chat_members SET muted_until = ? WHERE chat_id = ? AND user_id = ?')->execute([$until, $chatId, $target]);
    $stmt = $pdo->prepare('SELECT nickname FROM users WHERE id = ?');
    $stmt->execute([$target]);
    $targetName = (string)$stmt->fetchColumn();
    push_message($chatId, $uid, $until > 0 ? $targetName . ' 被禁言 ' . $minutes . ' 分钟' : $targetName . ' 被解除禁言', 'system');
    json_out(['ok' => true, 'muted_until' => $until]);
}

if ($action === 'invite') {
    $manager = is_chat_manager($chat, $uid);
    $added = 0;
    $pending = 0;
    foreach (group_ids_from($data['user_ids'] ?? []) as $memberId) {
        if ($memberId === $uid || !are_friends($uid, $memberId)) {
            continue;
        }
        $stmt = $pdo->prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?');
        $stmt->execute([$chatId, $memberId]);
        if ($stmt->fetchColumn() !== false) {
            continue;
        }
        if ($manager) {
            join_chat($chatId, $memberId);
            $added++;
            continue;
        }
        $pdo->prepare('INSERT INTO group_invites (chat_id, inviter_id, invitee_id, status, created_at) VALUES (?, ?, ?, \'pending\', ?)
            ON CONFLICT(chat_id, invitee_id) DO UPDATE SET status = \'pending\', inviter_id = excluded.inviter_id, created_at = excluded.created_at')
            ->execute([$chatId, $uid, $memberId, time()]);
        $pending++;
    }
    if ($added > 0) {
        push_message($chatId, $uid, $user['nickname'] . ' 邀请 ' . $added . ' 位好友加入群聊', 'system');
    }
    json_out(['ok' => true, 'added' => $added, 'pending' => $pending]);
}

if ($action === 'approve' || $action === 'reject') {
    if (!is_chat_manager($chat, $uid)) {
        fail('只有群主或管理员可以处理邀请', 403);
    }
    $inviteId = int_field($data, 'invite_id', '邀请');
    $stmt = $pdo->prepare('SELECT invitee_id FROM group_invites WHERE id = ? AND chat_id = ? AND status = \'pending\'');
    $stmt->execute([$inviteId, $chatId]);
    $invitee = (int)$stmt->fetchColumn();
    if ($invitee === 0) {
        fail('邀请不存在或已处理', 404);
    }
    if ($action === 'approve') {
        join_chat($chatId, $invitee);
        $nameStmt = $pdo->prepare('SELECT nickname FROM users WHERE id = ?');
        $nameStmt->execute([$invitee]);
        push_message($chatId, $uid, '同意 ' . (string)$nameStmt->fetchColumn() . ' 加入群聊', 'system');
        $pdo->prepare('UPDATE group_invites SET status = \'accepted\' WHERE id = ?')->execute([$inviteId]);
        json_out(['ok' => true, 'added' => 1]);
    }
    $pdo->prepare('UPDATE group_invites SET status = \'rejected\' WHERE id = ?')->execute([$inviteId]);
    json_out(['ok' => true]);
}

if ($action === 'leave') {
    if ((int)$chat['is_default'] === 1) {
        fail('默认群聊不能退出');
    }
    $pdo->prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?')->execute([$chatId, $uid]);
    push_message($chatId, $uid, $user['nickname'] . ' 退出了群聊', 'system');
    if ((int)$chat['owner_id'] === $uid) {
        $stmt = $pdo->prepare('SELECT user_id FROM chat_members WHERE chat_id = ? ORDER BY joined_at ASC, user_id ASC LIMIT 1');
        $stmt->execute([$chatId]);
        $next = $stmt->fetchColumn();
        $pdo->prepare('UPDATE chats SET owner_id = ? WHERE id = ?')->execute([$next === false ? null : (int)$next, $chatId]);
    }
    json_out(['ok' => true]);
}

fail('未知操作');
