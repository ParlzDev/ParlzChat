<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

require_post();
$data = request_data();
$action = (string)($data['action'] ?? '');

if ($action === 'send') {
    if (!email_ready()) {
        fail('服务器还没配置邮件服务，暂时不能发验证码', 503);
    }
    $purpose = (string)($data['purpose'] ?? 'register');
    if (!in_array($purpose, ['register', 'reset', 'rebind'], true)) {
        fail('用途不对');
    }
    rate_guard('email_send', rate_scope(), 6, 3600);
    $email = email_normalize((string)($data['email'] ?? ''));
    if ($email === '') {
        fail('请填写正确的邮箱地址');
    }
    rate_guard('email_send_addr', $email, 1, 60);
    if ($purpose === 'register' && email_taken($email)) {
        fail('这个邮箱已经注册过了');
    }
    if ($purpose === 'reset' && !email_taken($email)) {
        fail('这个邮箱还没注册过 Parlz');
    }
    if ($purpose === 'rebind') {
        $me = current_user();
        if ($me === null) {
            fail('请先登录再改邮箱', 401);
        }
        rate_guard('email_rebind', (string)$me['id'], 5, 3600);
    }
    email_code_sweep();
    $nickname = trim((string)($data['nickname'] ?? ''));
    if ($nickname === '') {
        $nickname = '新用户';
    }
    $code = email_code_issue($email, $purpose);
    $subject = $purpose === 'reset' ? 'Parlz 重置密码验证码' : ($purpose === 'rebind' ? 'Parlz 换绑邮箱验证码' : 'Parlz 注册验证码');
    if (!parlz_mail_send($email, $subject, email_register_text(mb_substr($nickname, 0, 12), $code))) {
        $reason = parlz_mail_last_error();
        error_log('parlz mail failed: ' . $reason);
        fail('验证码发送失败，请稍后再试', 502);
    }
    json_out(['ok' => true, 'email' => $email, 'ttl' => PARLZ_EMAIL_CODE_TTL]);
}

fail('未知操作');
