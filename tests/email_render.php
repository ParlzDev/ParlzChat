<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$out = $argv[1] ?? (sys_get_temp_dir() . '/parlz-audit');
if (!is_dir($out)) {
    mkdir($out, 0777, true);
}

$results = [];
$check = static function (string $name, bool $ok, string $detail = '') use (&$results): void {
    $results[] = ['name' => $name, 'ok' => $ok];
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($detail === '' ? '' : ' :: ' . $detail) . PHP_EOL;
};

$code = '246810';
$nick = '<img src=x onerror=alert(1)>小明';
$purposes = ['register' => '注册账号', 'reset' => '重置密码', 'bind' => '绑定邮箱', 'rebind' => '换绑邮箱'];

foreach ($purposes as $purpose => $label) {
    $text = email_code_text($nick, $code, $purpose);
    $html = email_code_html($nick, $code, $purpose);
    $file = $out . '/mail-' . $purpose . '.html';
    file_put_contents($file, $html);

    $check($label . '：纯文本里有验证码', str_contains($text, $code), substr($text, 0, 60));
    $check($label . '：纯文本按用途写文案', str_contains($text, $label), $text);
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $loaded = $doc->loadHTML('<?xml encoding="utf-8" ?>' . $html);
    $errors = array_values(array_filter(libxml_get_errors(), static fn ($e) => $e->level >= LIBXML_ERR_ERROR));
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    $check($label . '：HTML 结构能解析', $loaded === true && $errors === [], (string)count($errors));

    $riskyTags = [];
    $remoteAttrs = [];
    foreach ($doc->getElementsByTagName('*') as $el) {
        $tag = strtolower($el->nodeName);
        if (in_array($tag, ['img', 'script', 'iframe', 'link', 'object', 'embed', 'video', 'audio', 'source', 'form', 'a'], true)) {
            $riskyTags[] = $tag;
        }
        foreach ($el->attributes as $attr) {
            $name = strtolower($attr->nodeName);
            if (str_starts_with($name, 'on') || in_array($name, ['src', 'srcset', 'href', 'background', 'data', 'action'], true)) {
                $remoteAttrs[] = $name;
            }
        }
    }
    $check($label . '：不加载任何远程资源、没有可点的链接、没有脚本表单',
        $riskyTags === [] && $remoteAttrs === [],
        'tags=' . implode(',', $riskyTags) . ' attrs=' . implode(',', $remoteAttrs));
    $check($label . '：样式块里没有 url() / @import',
        stripos($html, 'url(') === false && stripos($html, '@import') === false);
    $check($label . '：正文文本里能看到验证码',
        str_contains(preg_replace('/\s+/', '', $doc->textContent), $code));
    $check($label . '：昵称按文本渲染（转义后不产生标签）',
        !str_contains($html, '<img') && str_contains($doc->textContent, $nick));
    $check($label . '：关键样式是内联的（客户端剥掉 style 块也不塌）',
        str_contains($html, 'style="width:100%;max-width:460px') && str_contains($html, 'letter-spacing:9px'));
    $check($label . '：带深色模式分支', str_contains($html, 'prefers-color-scheme: dark'));
    $check($label . '：带 BUG 反馈邮箱（两种格式都要有）',
        str_contains($text, '如有 BUG 反馈请发到 jgz_yes@parlz.com') && str_contains($html, '如有 BUG 反馈请发到 jgz_yes@parlz.com'),
        'text=' . (str_contains($text, 'jgz_yes@parlz.com') ? 'y' : 'n') . ' html=' . (str_contains($html, 'jgz_yes@parlz.com') ? 'y' : 'n'));
    $check($label . '：反馈邮箱不做成可点链接（邮件里不许有 href）',
        str_contains($html, 'jgz_yes@parlz.com') && stripos($html, 'mailto:') === false);
    $check($label . '：带版权署名（两种格式都要有）',
        str_contains($text, '版权 JGZ_YES & Parlz') && str_contains($html, '版权 JGZ_YES &amp; Parlz'),
        'text=' . (str_contains($text, '版权 JGZ_YES & Parlz') ? 'y' : 'n') . ' html=' . (str_contains($html, '版权 JGZ_YES &amp; Parlz') ? 'y' : 'n'));
    $check($label . '：用站点同一套纯色（绿头 + 亮绿码块）',
        str_contains($html, '#00d95f') && str_contains($html, '#04170b') && str_contains($html, '#e4fbec'));
}

$plain = parlz_mail_message('someone@example.com', 'Parlz 注册验证码', email_code_text('小明', $code, 'register'));
$multi = parlz_mail_message('someone@example.com', 'Parlz 注册验证码', email_code_text('小明', $code, 'register'), email_code_html('小明', $code, 'register'));

$check('不带 HTML 时仍是单段纯文本邮件',
    str_contains($plain, "Content-Type: text/plain; charset=UTF-8") && !str_contains($plain, 'multipart/alternative'));
$check('带 HTML 时是 multipart/alternative',
    str_contains($multi, 'Content-Type: multipart/alternative; boundary="parlz-')
    && str_contains($multi, "Content-Type: text/plain; charset=UTF-8")
    && str_contains($multi, "Content-Type: text/html; charset=UTF-8"));
$check('multipart 有结束边界', preg_match('/--parlz-[0-9a-f]{16}--\r\n\.$/', $multi) === 1);
$check('报文以 SMTP 终止点结尾', str_ends_with($multi, "\r\n."));
$check('报文里没有裸换行（CRLF 规范）', preg_match("/(?<!\r)\n/", $multi) === 0);
$check('头部齐全', str_contains($multi, 'Subject: =?UTF-8?B?') && str_contains($multi, 'Message-ID: <') && str_contains($multi, 'Date: '));

preg_match('/boundary="([^"]+)"/', $multi, $bm);
$boundary = $bm[1] ?? '';
$bodyStart = $boundary === '' ? false : strpos($multi, "\r\n\r\n");
$decodedText = '';
$decodedHtml = '';
if ($bodyStart !== false) {
    $body = substr($multi, $bodyStart + 4);
    foreach (preg_split('/--' . preg_quote($boundary, '/') . '(?:--)?\r\n/', $body) ?: [] as $segment) {
        $sep = strpos($segment, "\r\n\r\n");
        if (trim($segment) === '' || $sep === false) {
            continue;
        }
        $head = substr($segment, 0, $sep);
        $data = preg_replace('/\s+/', '', substr($segment, $sep + 4));
        $decoded = base64_decode((string)$data, true);
        if ($decoded === false) {
            continue;
        }
        if (str_contains($head, 'text/html')) {
            $decodedHtml = $decoded;
        } elseif (str_contains($head, 'text/plain')) {
            $decodedText = $decoded;
        }
    }
}
$check('base64 段能还原成原文（验证码两段都在）',
    str_contains($decodedText, $code) && str_contains($decodedHtml, $code) && str_starts_with($decodedHtml, '<!DOCTYPE html>'),
    'text=' . strlen($decodedText) . ' html=' . strlen($decodedHtml));
$check('HTML 段还原后仍然不加载远程资源', stripos($decodedHtml, '<img') === false && stripos($decodedHtml, 'http://') === false);

$bad = array_values(array_filter($results, static fn ($r) => $r['ok'] !== true));
echo '产物目录: ' . $out . PHP_EOL;
echo count($bad) === 0 ? '全部通过 (' . count($results) . ')' : '失败: ' . implode('、', array_map(static fn ($r) => $r['name'], $bad)) . PHP_EOL;
exit(count($bad) === 0 ? 0 : 1);
