<?php

declare(strict_types=1);

function parlz_mail_last_error(): string
{
    return (string)($GLOBALS['parlzMailError'] ?? '');
}

function parlz_mail_ca(): string
{
    foreach ([PARLZ_CA_FILE, '/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'] as $candidate) {
        if ($candidate !== '' && @is_file($candidate)) {
            return $candidate;
        }
    }
    return '';
}

function parlz_mail_read($fp): string
{
    $data = '';
    while (($line = fgets($fp, 2048)) !== false) {
        $data .= $line;
        if (strlen($line) < 4 || $line[3] !== '-') {
            break;
        }
    }
    return trim($data);
}

function parlz_mail_cmd($fp, string $command, string $expect): string
{
    if ($command !== '') {
        fwrite($fp, $command . "\r\n");
    }
    $reply = parlz_mail_read($fp);
    if ($expect !== '' && !str_starts_with($reply, $expect)) {
        $GLOBALS['parlzMailError'] = $command . ' -> ' . $reply;
    }
    return $reply;
}

function parlz_mail_ready(): bool
{
    return PARLZ_SMTP_HOST !== '' && PARLZ_SMTP_USER !== '' && PARLZ_SMTP_PASS !== '';
}

function parlz_mail_message(string $to, string $subject, string $text, string $html = ''): string
{
    $tag = bin2hex(random_bytes(8));
    $headers = 'From: =?UTF-8?B?' . base64_encode(PARLZ_NAME) . '?= <' . PARLZ_SMTP_USER . '>' . "\r\n"
        . 'To: <' . $to . '>' . "\r\n"
        . 'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=' . "\r\n"
        . 'MIME-Version: 1.0' . "\r\n"
        . 'Message-ID: <' . $tag . '@parlz.com>' . "\r\n"
        . 'Date: ' . date('r') . "\r\n";
    $encodedText = rtrim(chunk_split(base64_encode($text), 76, "\r\n"));

    if ($html === '') {
        $headers .= 'Content-Type: text/plain; charset=UTF-8' . "\r\n"
            . 'Content-Transfer-Encoding: base64' . "\r\n";
        return $headers . "\r\n" . $encodedText . "\r\n.";
    }

    $boundary = 'parlz-' . $tag;
    $encodedHtml = rtrim(chunk_split(base64_encode($html), 76, "\r\n"));
    $headers .= 'Content-Type: multipart/alternative; boundary="' . $boundary . '"' . "\r\n";
    $body = '--' . $boundary . "\r\n"
        . 'Content-Type: text/plain; charset=UTF-8' . "\r\n"
        . 'Content-Transfer-Encoding: base64' . "\r\n\r\n"
        . $encodedText . "\r\n"
        . '--' . $boundary . "\r\n"
        . 'Content-Type: text/html; charset=UTF-8' . "\r\n"
        . 'Content-Transfer-Encoding: base64' . "\r\n\r\n"
        . $encodedHtml . "\r\n"
        . '--' . $boundary . '--' . "\r\n";
    return $headers . "\r\n" . $body . '.';
}

function parlz_mail_send(string $to, string $subject, string $text, string $html = ''): bool
{
    $GLOBALS['parlzMailError'] = '';
    if (!parlz_mail_ready()) {
        $GLOBALS['parlzMailError'] = '邮件服务未配置';
        return false;
    }
    if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
        $GLOBALS['parlzMailError'] = '收件地址不合法';
        return false;
    }

    $host = PARLZ_SMTP_HOST;
    $port = PARLZ_SMTP_PORT;
    $ssl = [
        'peer_name' => $host,
        'verify_peer' => true,
        'verify_peer_name' => true,
        'SNI_enabled' => true,
        'allow_self_signed' => false,
    ];
    $ca = parlz_mail_ca();
    if ($ca !== '') {
        $ssl['cafile'] = $ca;
    }
    $context = stream_context_create(['ssl' => $ssl]);
    $errno = 0;
    $errstr = '';
    $fp = @stream_socket_client('tcp://' . $host . ':' . $port, $errno, $errstr, 12.0, STREAM_CLIENT_CONNECT, $context);
    if ($fp === false) {
        $GLOBALS['parlzMailError'] = '连接失败：' . $errstr;
        return false;
    }
    stream_set_timeout($fp, 20);

    $banner = parlz_mail_read($fp);
    if (!str_starts_with($banner, '220')) {
        $GLOBALS['parlzMailError'] = 'banner -> ' . $banner;
        fclose($fp);
        return false;
    }

    $domain = 'parlz.com';
    $ehlo = parlz_mail_cmd($fp, 'EHLO ' . $domain, '250');
    if (stripos($ehlo, 'STARTTLS') !== false) {
        parlz_mail_cmd($fp, 'STARTTLS', '220');
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (@stream_socket_enable_crypto($fp, true, $crypto) !== true) {
            $GLOBALS['parlzMailError'] = 'STARTTLS 握手失败';
            fclose($fp);
            return false;
        }
        parlz_mail_cmd($fp, 'EHLO ' . $domain, '250');
    }

    $auth = parlz_mail_cmd($fp, 'AUTH LOGIN', '334');
    if (!str_starts_with($auth, '334')) {
        fclose($fp);
        return false;
    }
    $authUser = parlz_mail_cmd($fp, base64_encode(PARLZ_SMTP_USER), '334');
    if (!str_starts_with($authUser, '334')) {
        fclose($fp);
        return false;
    }
    $authPass = parlz_mail_cmd($fp, base64_encode(PARLZ_SMTP_PASS), '235');
    if (!str_starts_with($authPass, '235')) {
        fclose($fp);
        return false;
    }

    if (!str_starts_with(parlz_mail_cmd($fp, 'MAIL FROM:<' . PARLZ_SMTP_USER . '>', '250'), '250')) {
        fclose($fp);
        return false;
    }
    if (!str_starts_with(parlz_mail_cmd($fp, 'RCPT TO:<' . $to . '>', '250'), '250')) {
        fclose($fp);
        return false;
    }
    if (!str_starts_with(parlz_mail_cmd($fp, 'DATA', '354'), '354')) {
        fclose($fp);
        return false;
    }

    $sent = parlz_mail_cmd($fp, parlz_mail_message($to, $subject, $text, $html), '250');
    $ok = str_starts_with($sent, '250');
    parlz_mail_cmd($fp, 'QUIT', '221');
    fclose($fp);
    return $ok;
}
