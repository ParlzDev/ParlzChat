<?php
$db = new PDO('sqlite:/www/sites/chat.parlz.com/index/data/parlz.sqlite', '', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$want = ['rate_limits', 'messages_fts', 'stt_texts', 'email_codes', 'user_days', 'face_codes'];
$have = [];
foreach ($db->query('SELECT name FROM sqlite_master WHERE type IN (\'table\',\'view\')') as $r) {
    $have[] = $r['name'];
}
$missing = array_diff($want, $have);
echo 'tables=' . count($have) . PHP_EOL;
echo 'missing=' . ($missing === [] ? 'NONE' : implode(',', $missing)) . PHP_EOL;
foreach ([['users', ['email', 'is_admin']], ['chats', ['search_mode', 'join_mode']]] as [$t, $cols]) {
    $real = [];
    foreach ($db->query('PRAGMA table_info(' . $t . ')') as $r) {
        $real[] = $r['name'];
    }
    $gap = array_diff($cols, $real);
    echo $t . ' cols missing=' . ($gap === [] ? 'NONE' : implode(',', $gap)) . PHP_EOL;
}
echo 'default_chats=' . $db->query('SELECT COUNT(*) FROM chats WHERE is_default = 1')->fetchColumn() . PHP_EOL;
echo 'stamp=' . @file_get_contents('/www/sites/chat.parlz.com/index/data/schema.stamp') . PHP_EOL;
echo 'phpinfo_ver=' . PHP_VERSION . PHP_EOL;
