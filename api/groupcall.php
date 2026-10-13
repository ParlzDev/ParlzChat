<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

const GCALL_MAX = 8;
const GCALL_TTL = 150;
const GCALL_ALIVE = 90;
const GCALL_SIGNAL_MAX = 16000;

$user = require_user();
$uid = (int)$user['id'];
$pdo = db();

function gcall_touch(int $chatId, int $uid): void
{
    db_write(static function () use ($chatId, $uid): void {
        db()->prepare('UPDATE group_call_members SET last_seen = ? WHERE chat_id = ? AND user_id = ?')
            ->execute([time(), $chatId, $uid]);
    });
}

function gcall_sweep(): void
{
    $cutoff = time() - GCALL_TTL;
    $dead = time() - GCALL_ALIVE;
    db()->exec('DELETE FROM group_call_signals WHERE created_at < ' . $cutoff);
    db()->exec('DELETE FROM group_call_members WHERE last_seen > 0 AND last_seen < ' . $dead);
    db()->exec('DELETE FROM group_call_states WHERE chat_id NOT IN (SELECT chat_id FROM group_call_members) AND created_at < ' . ($dead - 30));
}

function gcall_row(int $chatId): ?array
{
    $stmt = db()->prepare('SELECT * FROM group_call_states WHERE chat_id = ?');
    $stmt->execute([$chatId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function gcall_member_ids(int $chatId): array
{
    $stmt = db()->prepare('SELECT user_id FROM group_call_members WHERE chat_id = ? ORDER BY joined_at ASC');
    $stmt->execute([$chatId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function gcall_members(int $chatId): array
{
    $ids = gcall_member_ids($chatId);
    if ($ids === []) {
        return [];
    }
    $stmt = db()->prepare('SELECT u.id, u.username, u.nickname, u.bio, u.avatar, m.muted
        FROM group_call_members m JOIN users u ON u.id = m.user_id
        WHERE m.chat_id = ? AND m.last_seen > ' . (time() - 120) . ' ORDER BY m.joined_at ASC');
    $stmt->execute([$chatId]);
    $list = [];
    foreach ($stmt->fetchAll() as $row) {
        $member = user_public($row);
        $member['muted'] = (int)($row['muted'] ?? 0) === 1;
        $member['level'] = level_of((int)$row['id']);
        $list[] = $member;
    }
    return $list;
}

function gcall_push(int $chatId, int $fromUid, int $toUid, string $kind, string $payload): void
{
    db_write(static function () use ($chatId, $fromUid, $toUid, $kind, $payload): void {
        db()->prepare('INSERT INTO group_call_signals (chat_id, from_uid, to_uid, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$chatId, $fromUid, $toUid, $kind, $payload, time()]);
    });
}

function gcall_last_signal(int $chatId): int
{
    $stmt = db()->prepare('SELECT MAX(id) FROM group_call_signals WHERE chat_id = ?');
    $stmt->execute([$chatId]);
    return (int)$stmt->fetchColumn();
}

function gcall_status(int $chatId, int $uid): array
{
    $state = gcall_row($chatId);
    $members = gcall_members($chatId);
    return [
        'active' => $state !== null && $members !== [],
        'since' => $state === null ? 0 : (int)$state['created_at'],
        'started_by' => $state === null ? 0 : (int)$state['started_by'],
        'in_call' => in_array($uid, gcall_member_ids($chatId), true),
        'members' => $members,
        'max' => GCALL_MAX,
        'last' => gcall_last_signal($chatId),
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $chatId = (int)($_GET['chat_id'] ?? 0);
    if ($chatId <= 0) {
        fail('会话参数无效');
    }
    member_chat($chatId, $uid);
    gcall_sweep();
    json_out(['ok' => true] + gcall_status($chatId, $uid));
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');
$chatId = int_field($data, 'chat_id', '会话');
$chat = member_chat($chatId, $uid);
if ((string)$chat['type'] !== 'group') {
    fail('只有群聊支持语音通话');
}
gcall_sweep();

if ($action === 'join') {
    if (call_active_for($uid) !== null) {
        fail('你先接完当前的 1 对 1 通话');
    }
    $ids = gcall_member_ids($chatId);
    if (!in_array($uid, $ids, true) && count($ids) >= GCALL_MAX) {
        fail('群通话最多 ' . GCALL_MAX . ' 人，已经满了');
    }
    db_write(static function () use ($chatId, $uid): void {
        $pdo = db();
        $stmt = $pdo->prepare('SELECT 1 FROM group_call_states WHERE chat_id = ?');
        $stmt->execute([$chatId]);
        if ($stmt->fetchColumn() === false) {
            $pdo->prepare('INSERT INTO group_call_states (chat_id, started_by, created_at) VALUES (?, ?, ?)')
                ->execute([$chatId, $uid, time()]);
        }
        $pdo->prepare('INSERT OR IGNORE INTO group_call_members (chat_id, user_id, muted, joined_at) VALUES (?, ?, 0, ?)')
            ->execute([$chatId, $uid, time()]);
    });
    $self = user_public($user);
    $self['muted'] = false;
    $self['level'] = level_of($uid);
    gcall_touch($chatId, $uid);
    gcall_push($chatId, $uid, 0, 'join', (string)json_encode(['user' => $self], JSON_UNESCAPED_UNICODE));
    json_out(['ok' => true] + gcall_status($chatId, $uid));
}

if ($action === 'leave') {
    db_write(static function () use ($chatId, $uid): void {
        $pdo = db();
        $pdo->prepare('DELETE FROM group_call_members WHERE chat_id = ? AND user_id = ?')->execute([$chatId, $uid]);
        $left = $pdo->prepare('SELECT COUNT(*) FROM group_call_members WHERE chat_id = ?');
        $left->execute([$chatId]);
        if ((int)$left->fetchColumn() === 0) {
            $pdo->prepare('DELETE FROM group_call_states WHERE chat_id = ?')->execute([$chatId]);
            $pdo->prepare('DELETE FROM group_call_signals WHERE chat_id = ?')->execute([$chatId]);
        }
    });
    gcall_push($chatId, $uid, 0, 'bye', (string)json_encode(['uid' => $uid]));
    json_out(['ok' => true] + gcall_status($chatId, $uid));
}

if ($action === 'mute') {
    $muted = (string)($data['muted'] ?? '0') === '1' ? 1 : 0;
    $ids = gcall_member_ids($chatId);
    if (!in_array($uid, $ids, true)) {
        fail('你不在群通话里', 403);
    }
    db_write(static function () use ($chatId, $uid, $muted): void {
        db()->prepare('UPDATE group_call_members SET muted = ? WHERE chat_id = ? AND user_id = ?')->execute([$muted, $chatId, $uid]);
        db()->prepare('UPDATE group_call_members SET last_seen = ? WHERE chat_id = ? AND user_id = ?')->execute([time(), $chatId, $uid]);
    });
    gcall_push($chatId, $uid, 0, 'state', (string)json_encode(['uid' => $uid, 'muted' => $muted === 1]));
    json_out(['ok' => true, 'muted' => $muted === 1]);
}

if ($action === 'signal') {
    $to = int_field($data, 'to', '对方');
    $kind = (string)($data['kind'] ?? '');
    if (!in_array($kind, ['offer', 'answer', 'ice'], true)) {
        fail('信令类型不对');
    }
    $ids = gcall_member_ids($chatId);
    if (!in_array($uid, $ids, true) || !in_array($to, $ids, true)) {
        fail('对方不在群通话里', 403);
    }
    $payload = $data['payload'] ?? null;
    $json = is_array($payload) ? json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '';
    if (!is_string($json) || $json === '' || strlen($json) > GCALL_SIGNAL_MAX) {
        fail('信令内容不对或过大');
    }
    gcall_push($chatId, $uid, $to, $kind, $json);
    json_out(['ok' => true]);
}

if ($action === 'poll') {
    $after = (int)($data['after'] ?? 0);
    rate_guard('gcall_poll', $uid . ':' . $chatId, 240, 60);
    if (in_array($uid, gcall_member_ids($chatId), true)) {
        gcall_touch($chatId, $uid);
    }
    $stmt = $pdo->prepare('SELECT id, from_uid, to_uid, kind, payload FROM group_call_signals
        WHERE chat_id = ? AND id > ? AND (to_uid = ? OR to_uid = 0) AND from_uid <> ?
        ORDER BY id ASC LIMIT 160');
    $stmt->execute([$chatId, $after, $uid, $uid]);
    $signals = [];
    foreach ($stmt->fetchAll() as $row) {
        $payload = json_decode((string)$row['payload'], true);
        $signals[] = [
            'id' => (int)$row['id'],
            'from' => (int)$row['from_uid'],
            'kind' => (string)$row['kind'],
            'payload' => is_array($payload) ? $payload : null,
        ];
    }
    json_out(['ok' => true, 'signals' => $signals] + gcall_status($chatId, $uid));
}

fail('未知操作');
