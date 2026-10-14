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

function email_copy(string $purpose): array
{
    $minutes = (int)(PARLZ_EMAIL_CODE_TTL / 60);
    if ($purpose === 'reset') {
        return [
            'title' => '重置密码',
            'note' => '有人正在重置你这个 Parlz 账号的密码。把下面的验证码填回网页就能继续。',
            'tip' => '如果这不是你本人操作，忽略这封邮件即可，你的密码不会有任何改动。',
            'ttl' => '验证码 ' . $minutes . ' 分钟内有效，用过一次就失效。',
        ];
    }
    if ($purpose === 'rebind') {
        return [
            'title' => '换绑邮箱',
            'note' => '你正在把这个 Parlz 账号换绑到这个新邮箱。把下面的验证码填回网页就能完成换绑。',
            'tip' => '如果这不是你本人操作，忽略这封邮件即可，你原来的邮箱仍然有效。',
            'ttl' => '验证码 ' . $minutes . ' 分钟内有效，用过一次就失效。',
        ];
    }
    return [
        'title' => '注册账号',
        'note' => '欢迎来 Parlz。把下面的验证码填回网页，就完成注册了。',
        'tip' => '如果这不是你本人操作，忽略这封邮件即可。',
        'ttl' => '验证码 ' . $minutes . ' 分钟内有效，用过一次就失效。',
    ];
}

function email_code_text(string $nickname, string $code, string $purpose = 'register'): string
{
    $copy = email_copy($purpose);
    return $nickname . '，你好：' . "\n\n"
        . '你的 Parlz ' . $copy['title'] . '验证码是 ' . $code . "。\n"
        . $copy['ttl'] . "\n\n"
        . $copy['tip'] . "\n\n"
        . '—— Parlz · chat.parlz.com';
}

function email_code_html(string $nickname, string $code, string $purpose = 'register'): string
{
    $copy = email_copy($purpose);
    $nick = htmlspecialchars($nickname, ENT_QUOTES, 'UTF-8');
    $digits = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
    $title = htmlspecialchars('Parlz ' . $copy['title'] . '验证码', ENT_QUOTES, 'UTF-8');
    $note = htmlspecialchars($copy['note'], ENT_QUOTES, 'UTF-8');
    $tip = htmlspecialchars($copy['tip'], ENT_QUOTES, 'UTF-8');
    $ttl = htmlspecialchars($copy['ttl'], ENT_QUOTES, 'UTF-8');

    return '<!DOCTYPE html>'
        . '<html lang="zh-CN"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="color-scheme" content="light dark">'
        . '<meta name="supported-color-schemes" content="light dark">'
        . '<title>' . $title . '</title>'
        . '<style>'
        . '@media (prefers-color-scheme: dark) {'
        . 'body{background:#101a15 !important;}'
        . '.mail-canvas{background:#101a15 !important;}'
        . '.mail-card{background:#16241c !important;border-color:#274634 !important;}'
        . '.mail-h1,.mail-line{color:#e8fff2 !important;}'
        . '.mail-muted{color:#86b79c !important;}'
        . '.mail-code{background:#1c3125 !important;border-color:#23ff7d !important;}'
        . '.mail-code span{color:#23ff7d !important;}'
        . '.mail-rule{background:#274634 !important;}'
        . '.mail-foot{background:#121e18 !important;}'
        . '}'
        . '</style>'
        . '</head>'
        . '<body style="margin:0;padding:0;background:#eefcf4;">'
        . '<table role="presentation" class="mail-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" '
        . 'style="background:#eefcf4;padding:28px 16px;">'
        . '<tr><td align="center">'
        . '<table role="presentation" class="mail-card" width="100%" cellpadding="0" cellspacing="0" border="0" '
        . 'style="width:100%;max-width:460px;background:#ffffff;border:1px solid #cdeedd;border-radius:14px;overflow:hidden;">'
        . '<tr><td style="background:#00d95f;padding:14px 22px;">'
        . '<span style="font:700 17px/22px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;'
        . 'color:#04170b;letter-spacing:1px;">Parlz</span>'
        . '</td></tr>'
        . '<tr><td style="padding:26px 22px 8px 22px;">'
        . '<p class="mail-h1" style="margin:0 0 10px 0;font:700 19px/27px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#0b2415;">'
        . $nick . '，你好</p>'
        . '<p class="mail-line" style="margin:0 0 20px 0;font:400 14px/23px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#0b2415;">'
        . $note . '</p>'
        . '<p class="mail-muted" style="margin:0 0 8px 0;font:400 12px/18px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#4a7a60;">'
        . '验证码</p>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
        . '<td class="mail-code" align="center" style="background:#e4fbec;border:1px solid #8fe0b5;border-radius:10px;padding:16px 8px;">'
        . '<span style="font:700 30px/34px \'SFMono-Regular\',Consolas,\'Liberation Mono\',Menlo,monospace;'
        . 'letter-spacing:9px;color:#056a37;text-indent:9px;">' . $digits . '</span>'
        . '</td></tr></table>'
        . '<p class="mail-muted" style="margin:10px 0 22px 0;font:400 12px/19px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#4a7a60;">'
        . $ttl . '</p>'
        . '<div class="mail-rule" style="height:1px;background:#cdeedd;font-size:0;line-height:0;">&nbsp;</div>'
        . '<p class="mail-muted" style="margin:16px 0 0 0;font:400 12px/19px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#4a7a60;">'
        . $tip . '</p>'
        . '</td></tr>'
        . '<tr><td class="mail-foot" style="padding:14px 22px 18px 22px;background:#f4fdf8;">'
        . '<p class="mail-muted" style="margin:0;font:400 11px/17px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#4a7a60;">'
        . '这封邮件由 Parlz 系统自动发送，请直接回到网页填写验证码，不要回复。'
        . '</p>'
        . '</td></tr>'
        . '</table>'
        . '<p class="mail-muted" style="margin:16px 0 0 0;font:400 11px/17px -apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#4a7a60;">'
        . 'Parlz · chat.parlz.com'
        . '</p>'
        . '</td></tr></table>'
        . '</body></html>';
}
