<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$to = $argv[1] ?? 'noreply@parlz.com';
echo 'ready=' . (parlz_mail_ready() ? 'yes' : 'no') . PHP_EOL;
echo 'host=' . PARLZ_SMTP_HOST . ':' . PARLZ_SMTP_PORT . PHP_EOL;
$ok = parlz_mail_send($to, 'Parlz 发信自检', '这是一封自检邮件 ' . date('c'));
echo 'sent=' . ($ok ? 'ok' : 'fail') . PHP_EOL;
if (!$ok) {
    echo 'error=' . parlz_mail_last_error() . PHP_EOL;
}
