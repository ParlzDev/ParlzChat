<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$user = require_user();
$uid = (int)$user['id'];

$chatId = (int)($_GET['chat_id'] ?? 0);
$after = (int)($_GET['after'] ?? 0);
$typing = (string)($_GET['typing'] ?? '0') === '1';

presence_touch($uid, max(0, $chatId), $typing);

$callRow = call_current_row($uid);

$payload = [
    'ok' => true,
    'time' => time(),
    'build' => date('m-d H:i', parlz_build_time()),
    'chats' => chats_for_user($uid),
    'requests' => pending_request_count($uid),
    'call' => $callRow === null ? null : call_payload($callRow, $uid),
    'gcalls' => group_calls_for_user($uid),
    'messages' => [],
    'typing' => [],
    'online' => [],
    'status' => [],
    'recalled' => [],
];

if ($chatId > 0) {
    $stmt = db()->prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?');
    $stmt->execute([$chatId, $uid]);
    if ($stmt->fetchColumn() !== false) {
        $payload['messages'] = messages_after($chatId, max(0, $after));
        $payload['typing'] = typing_user_ids($chatId, $uid);
        $payload['recalled'] = recalled_ids($chatId);
        $online = online_map();
        foreach (group_members($chatId) as $member) {
            $id = (int)$member['id'];
            if (isset($online[$id])) {
                $payload['online'][] = $id;
                $payload['status'][(string)$id] = $online[$id];
            }
        }
    }
}

json_out($payload);
