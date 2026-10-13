<?php

declare(strict_types=1);

function email_ready(): bool
{
    return parlz_mail_ready();
}

function email_normalize(string $email): string
{
    $clean = strtolower(trim($email));
    return preg_match('/^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,12}$/', $clean) === 1 ? $clean : '';
}

function email_taken(string $email): bool
{
    $stmt = db()->prepare('SELECT 1 FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    return $stmt->fetchColumn() !== false;
}

function email_code_issue(string $email, string $purpose = 'register'): string
{
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $now = time();
    db_write(static function () use ($email, $code, $purpose, $now): void {
        db()->prepare('DELETE FROM email_codes WHERE email = ? AND used = 0')->execute([$email]);
        db()->prepare('INSERT INTO email_codes (email, code, purpose, tries, used, created_at, expires_at) VALUES (?, ?, ?, 0, 0, ?, ?)')
            ->execute([$email, $code, $purpose, $now, $now + PARLZ_EMAIL_CODE_TTL]);
    });
    return $code;
}

function email_code_check(string $email, string $code, string $purpose = 'register'): bool
{
    $stmt = db()->prepare('SELECT id, code, tries FROM email_codes WHERE email = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1');
    $stmt->execute([$email, $purpose]);
    $row = $stmt->fetch();
    if ($row === false) {
        return false;
    }
    if ((int)$row['tries'] >= PARLZ_EMAIL_CODE_MAX_TRIES) {
        return false;
    }
    db_write(static function () use ($row): void {
        db()->prepare('UPDATE email_codes SET tries = tries + 1 WHERE id = ?')->execute([(int)$row['id']]);
    });
    if (!hash_equals((string)$row['code'], $code)) {
        return false;
    }
    db_write(static function () use ($row): void {
        db()->prepare('UPDATE email_codes SET used = 1 WHERE id = ?')->execute([(int)$row['id']]);
    });
    return true;
}

function email_code_sweep(): void
{
    if (random_int(1, 50) !== 1) {
        return;
    }
    db_write(static function (): void {
        db()->prepare('DELETE FROM email_codes WHERE created_at < ?')->execute([time() - 86400]);
    });
}

function email_register_text(string $nickname, string $code): string
{
    return $nickname . '，你好：' . "\n\n"
        . '你的 Parlz 注册验证码是 ' . $code . '，' . (int)(PARLZ_EMAIL_CODE_TTL / 60) . ' 分钟内有效。' . "\n"
        . '如果这不是你本人操作，忽略这封邮件即可。' . "\n\n"
        . '—— Parlz';
}
