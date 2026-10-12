<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

const CALL_ICE_MAX = 48;

function normalize_sdp(string $sdp): string
{
    $clean = str_replace(["\r\n", "\r"], "\n", $sdp);
    $clean = rtrim($clean, "\n\t ");
    return str_replace("\n", "\r\n", $clean) . "\r\n";
}

$user = require_user();
$uid = (int)$user['id'];
$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $row = call_current_row($uid);
    json_out(['ok' => true, 'call' => $row === null ? null : call_payload($row, $uid, true)]);
}

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'start') {
    $peerId = int_field($data, 'user_id', '用户');
    if ($peerId === $uid) {
        fail('不能呼叫自己');
    }
    $kind = (string)($data['kind'] ?? 'audio') === 'video' ? 'video' : 'audio';
    $stmt = $pdo->prepare('SELECT id, username, nickname, bio, avatar FROM users WHERE id = ?');
    $stmt->execute([$peerId]);
    if ($stmt->fetch() === false) {
        fail('对方不存在', 404);
    }
    $mine = call_active_for($uid);
    if ($mine !== null) {
        fail('你正在通话中', 409);
    }
    $theirs = call_active_for($peerId);
    if ($theirs !== null) {
        fail('对方正在通话中', 409);
    }
    $now = time();
    $pdo->prepare('INSERT INTO calls (caller_id, callee_id, kind, status, created_at) VALUES (?, ?, ?, \'ringing\', ?)')
        ->execute([$uid, $peerId, $kind, $now]);
    $row = call_by_id((int)$pdo->lastInsertId());
    json_out(['ok' => true, 'call' => call_payload($row, $uid, true)]);
}

$callId = int_field($data, 'id', '通话');
$row = call_by_id($callId);
if ($row === null) {
    fail('通话不存在', 404);
}
$isCaller = (int)$row['caller_id'] === $uid;
$isCallee = (int)$row['callee_id'] === $uid;
if (!$isCaller && !$isCallee) {
    fail('无权操作这次通话', 403);
}
$status = (string)$row['status'];

if ($action === 'offer') {
    if (!$isCaller) {
        fail('只有主叫可以设置发起信息', 403);
    }
    if ($status !== 'ringing') {
        json_out(['ok' => true, 'call' => call_payload($row, $uid, true)]);
    }
    $sdp = (string)($data['sdp'] ?? '');
    if (trim($sdp) === '' || strlen($sdp) > 20000) {
        fail('发起信息无效');
    }
    $sdp = normalize_sdp($sdp);
    $pdo->prepare('UPDATE calls SET offer = ? WHERE id = ?')->execute([$sdp, $callId]);
}

if ($action === 'answer') {
    if (!$isCallee) {
        fail('只有被叫可以接听', 403);
    }
    if ($status === 'ringing') {
        $sdp = (string)($data['sdp'] ?? '');
        if (trim($sdp) === '' || strlen($sdp) > 20000) {
            fail('接听信息无效');
        }
        $sdp = normalize_sdp($sdp);
        $pdo->prepare('UPDATE calls SET answer = ?, status = \'active\', answered_at = ? WHERE id = ?')
            ->execute([$sdp, time(), $callId]);
    }
}

if ($action === 'ice') {
    $candidate = $data['candidate'] ?? null;
    if (!is_array($candidate) || $status === 'ended' || $status === 'declined' || $status === 'canceled' || $status === 'missed') {
        json_out(['ok' => true]);
    }
    $column = $isCaller ? 'ice_caller' : 'ice_callee';
    $list = json_decode((string)$row[$column], true);
    $list = is_array($list) ? $list : [];
    if (count($list) < CALL_ICE_MAX) {
        $list[] = $candidate;
        $pdo->prepare('UPDATE calls SET ' . $column . ' = ? WHERE id = ?')
            ->execute([json_encode($list, JSON_UNESCAPED_SLASHES), $callId]);
    }
    json_out(['ok' => true]);
}

if ($action === 'diag') {
    $diag = mb_substr((string)($data['data'] ?? ''), 0, 600);
    $column = $isCaller ? 'diag_caller' : 'diag_callee';
    $pdo->prepare('UPDATE calls SET ' . $column . ' = ? WHERE id = ?')->execute([$diag, $callId]);
    json_out(['ok' => true]);
}

if ($action === 'decline') {
    if (!$isCallee) {
        fail('只有被叫可以拒接', 403);
    }
    if ($status === 'ringing') {
        $stmt = $pdo->prepare('UPDATE calls SET status = \'declined\', ended_at = ? WHERE id = ? AND status = \'ringing\'');
        $stmt->execute([time(), $callId]);
        if ($stmt->rowCount() > 0) {
            call_record_message((array)call_by_id($callId));
        }
    }
}

if ($action === 'cancel') {
    if (!$isCaller) {
        fail('只有主叫可以取消', 403);
    }
    if ($status === 'ringing') {
        $stmt = $pdo->prepare('UPDATE calls SET status = \'canceled\', ended_at = ? WHERE id = ? AND status = \'ringing\'');
        $stmt->execute([time(), $callId]);
        if ($stmt->rowCount() > 0) {
            call_record_message((array)call_by_id($callId));
        }
    }
}

if ($action === 'hangup') {
    if ($status === 'ringing' || $status === 'active') {
        $stmt = $pdo->prepare('UPDATE calls SET status = \'ended\', ended_at = ? WHERE id = ? AND status IN (\'ringing\', \'active\')');
        $stmt->execute([time(), $callId]);
        if ($stmt->rowCount() > 0) {
            call_record_message((array)call_by_id($callId));
        }
    }
}

if (in_array($action, ['offer', 'answer', 'decline', 'cancel', 'hangup'], true)) {
    $fresh = call_by_id($callId);
    json_out(['ok' => true, 'call' => $fresh === null ? null : call_payload($fresh, $uid, true)]);
}

fail('未知操作');
