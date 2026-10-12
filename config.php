<?php

declare(strict_types=1);

const PARLZ_NAME = 'Parlz';
const PARLZ_ROOT = __DIR__;
const PARLZ_DATA = __DIR__ . '/data';
const PARLZ_DB = __DIR__ . '/data/parlz.sqlite';
const PARLZ_AVATAR_DIR = __DIR__ . '/assets/avatars';
const PARLZ_AVATAR_URL = 'assets/avatars';
const PARLZ_UPLOAD_DIR = __DIR__ . '/assets/uploads';
const PARLZ_UPLOAD_URL = 'assets/uploads';
const PARLZ_IMAGE_MAX_BYTES = 8388608;
const PARLZ_IMAGE_MAX_SIDE = 1280;
const PARLZ_IMAGE_QUALITY = 82;
const PARLZ_FILE_MAX_BYTES = 67108864;
const PARLZ_FILE_BLOCKED = ['php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phar', 'phtml', 'pht', 'htaccess', 'user.ini', 'ini'];
const PARLZ_MSG_MAX = 2000;
const PARLZ_NICK_MAX = 24;
const PARLZ_BIO_MAX = 80;
const PARLZ_ONLINE_WINDOW = 20;
const PARLZ_TYPING_WINDOW = 4;
const PARLZ_AWAY_REPLY = '我现在不在，稍后回复你';
const PARLZ_AWAY_COOLDOWN = 600;
const PARLZ_LOBBY = 'Parlz 广场';
const PARLZ_CA_FILE = '';

$parlzTurnFile = __DIR__ . '/turn/config.json';
$parlzTurn = is_file($parlzTurnFile) ? json_decode((string)@file_get_contents($parlzTurnFile), true) : null;
$parlzTurn = is_array($parlzTurn) ? $parlzTurn : [];
$parlzTurnHost = trim((string)($parlzTurn['public_host'] ?? ''));
if ($parlzTurnHost === '' && isset($parlzTurn['relay_ips'][0])) {
    $parlzTurnHost = trim((string)$parlzTurn['relay_ips'][0]);
}
define('PARLZ_TURN_HOST', $parlzTurnHost);
define('PARLZ_TURN_PORT', (int)($parlzTurn['public_port'] ?? 0) > 0 ? (int)$parlzTurn['public_port'] : (int)($parlzTurn['port'] ?? 3478));
define('PARLZ_TURN_USER', (string)($parlzTurn['user'] ?? ''));
define('PARLZ_TURN_PASS', (string)($parlzTurn['pass'] ?? ''));
define('PARLZ_TURN_TLS', false);
define('PARLZ_TURN_TRANSPORT', in_array(($parlzTurn['transport'] ?? 'both'), ['tcp', 'udp', 'both'], true) ? (string)$parlzTurn['transport'] : 'both');
const PARLZ_STICKERS = ['smile', 'grin', 'laugh', 'wink', 'love', 'cool', 'cry', 'angry', 'surprise', 'sleep', 'heart', 'star', 'smug', 'sneak', 'pout', 'doubt', 'speechless', 'fear', 'clap', 'rocket', 'melon', 'moon', 'fire', 'cake'];
