<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('cli only');
}

require_once __DIR__ . '/../includes/bootstrap.php';
require_once __DIR__ . '/../includes/email.php';

$to = (string)($argv[1] ?? '');
$purpose = (string)($argv[2] ?? 'bind');
$nick = (string)($argv[3] ?? 'JGZ_YES');
$code = (string)($argv[4] ?? '246810');

if ($to === '' || !parlz_mail_ready()) {
    echo 'bad-args-or-no-smtp' . PHP_EOL;
    exit(1);
}

$ok = parlz_mail_send($to, 'Parlz ' . email_copy($purpose)['title'] . '验证码（模板自检）', email_code_text($nick, $code, $purpose), email_code_html($nick, $code, $purpose));
echo ($ok ? 'SENT ' : 'FAILED ') . $to . ' purpose=' . $purpose . ($ok ? '' : ' err=' . parlz_mail_last_error()) . PHP_EOL;
exit($ok ? 0 : 1);
