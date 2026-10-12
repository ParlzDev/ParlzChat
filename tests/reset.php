<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$pdo = db();
$users = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
$messages = (int)$pdo->query('SELECT COUNT(*) FROM messages')->fetchColumn();
$chats = (int)$pdo->query('SELECT COUNT(*) FROM chats WHERE is_default = 0')->fetchColumn();

$pdo->exec('DELETE FROM users');
$pdo->exec('DELETE FROM chats WHERE is_default = 0');

$removed = 0;
$entries = scandir(PARLZ_AVATAR_DIR);
foreach ($entries === false ? [] : $entries as $entry) {
    if (str_ends_with($entry, '.webp')) {
        $file = PARLZ_AVATAR_DIR . '/' . $entry;
        if (is_file($file) && @unlink($file)) {
            $removed++;
        }
    }
}

$uploads = 0;
$entries = scandir(PARLZ_UPLOAD_DIR);
foreach ($entries === false ? [] : $entries as $entry) {
    if (str_ends_with($entry, '.webp')) {
        $file = PARLZ_UPLOAD_DIR . '/' . $entry;
        if (is_file($file) && @unlink($file)) {
            $uploads++;
        }
    }
}

$pdo->exec('DELETE FROM link_cards');

$left = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
echo '已清空 ' . $users . ' 位用户、' . $messages . ' 条消息、' . $chats . ' 个群聊/会话，删除 ' . $removed . ' 个头像文件、' . $uploads . ' 张聊天图片。' . PHP_EOL;
echo '剩余用户数: ' . $left . '，默认群: ' . $pdo->query('SELECT name FROM chats WHERE is_default = 1')->fetchColumn() . PHP_EOL;
exit($left === 0 ? 0 : 1);
