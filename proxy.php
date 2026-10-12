<?php

declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

const PARLZ_PROXY_MAX_BYTES = 3145728;
const PARLZ_PROXY_MAX_HOPS = 4;

function proxy_fail(string $message, int $status = 400): never
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    $title = '无法打开这个链接';
    echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">'
        . '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>'
        . '<style>body{margin:0;background:#eefcf4;color:#0b2415;font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}'
        . 'div{max-width:420px;background:#ffffff;border:1px solid #d5f0e0;border-radius:14px;padding:20px}'
        . 'h1{font-size:17px;margin:0 0 8px}p{margin:0;color:#28503a;word-break:break-all}</style></head><body><div>'
        . '<h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1>'
        . '<p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>'
        . '</div></body></html>';
    exit;
}

function proxy_public_host(string $host): bool
{
    $ips = @gethostbynamel($host);
    if (!is_array($ips) || $ips === []) {
        return false;
    }
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
    }
    return true;
}

function proxy_resolve(string $href, string $base): ?string
{
    $href = trim($href);
    if ($href === '' || $href[0] === '#') {
        return null;
    }
    if (preg_match('/^(javascript|mailto|tel|sms|data|blob|about|weixin|alipays|itms-apps):/i', $href) === 1) {
        return null;
    }
    if (str_starts_with($href, '//')) {
        $scheme = parse_url($base, PHP_URL_SCHEME);
        return ($scheme === 'http' ? 'http:' : 'https:') . $href;
    }
    if (preg_match('#^https?://#i', $href) === 1) {
        return $href;
    }
    $parts = parse_url($base);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        return null;
    }
    $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . (int)$parts['port'] : '');
    if ($href[0] === '/') {
        $path = $href;
    } else {
        $dir = isset($parts['path']) ? preg_replace('#/[^/]*$#', '/', (string)$parts['path']) : '/';
        $path = (string)$dir . $href;
    }
    $stack = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($stack);
            continue;
        }
        $stack[] = $segment;
    }
    return $origin . '/' . implode('/', $stack);
}

function proxy_link(string $absolute): string
{
    return 'proxy.php?url=' . rawurlencode($absolute);
}

function proxy_rewrite(string $html, string $base): string
{
    $html = preg_replace('#<meta[^>]+http-equiv=["\']?Content-Security-Policy["\']?[^>]*>#i', '', $html) ?? $html;
    $html = preg_replace('#<base\b[^>]*>#i', '', $html) ?? $html;

    $html = preg_replace_callback('#(<a\b[^>]*?\bhref\s*=\s*)(["\'])(.*?)\2#is', static function (array $m) use ($base): string {
        $absolute = proxy_resolve(html_entity_decode($m[3], ENT_QUOTES | ENT_HTML5, 'UTF-8'), $base);
        if ($absolute === null) {
            return $m[1] . $m[2] . $m[3] . $m[2];
        }
        return $m[1] . '"' . htmlspecialchars(proxy_link($absolute), ENT_QUOTES, 'UTF-8') . '"';
    }, $html) ?? $html;

    $inject = '<base href="' . htmlspecialchars($base, ENT_QUOTES, 'UTF-8') . '">';
    if (preg_match('#<head\b[^>]*>#i', $html) === 1) {
        $html = preg_replace('#(<head\b[^>]*>)#i', '$1' . $inject, $html, 1) ?? $html;
    } else {
        $html = $inject . $html;
    }
    return $html;
}

$user = require_user();
$target = trim((string)($_GET['url'] ?? ''));
if (preg_match('#^https?://#i', $target) !== 1) {
    proxy_fail('只支持 http:// 或 https:// 开头的链接');
}

$parts = parse_url($target);
$host = is_array($parts) ? (string)($parts['host'] ?? '') : '';
if ($host === '' || !proxy_public_host($host)) {
    proxy_fail('这个地址不允许代理访问（只允许公网网站）', 403);
}

$caFile = '';
foreach ([PARLZ_CA_FILE, '/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt'] as $candidate) {
    if ($candidate !== '' && is_file($candidate)) {
        $caFile = $candidate;
        break;
    }
}

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => PARLZ_PROXY_MAX_HOPS,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_ENCODING => '',
    CURLOPT_USERAGENT => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    CURLOPT_HTTPHEADER => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    ],
    CURLOPT_BUFFERSIZE => 65536,
    CURLOPT_NOPROGRESS => false,
    CURLOPT_PROGRESSFUNCTION => static function ($resource, float $downloadSize, float $downloaded): int {
        return ($downloadSize > PARLZ_PROXY_MAX_BYTES || $downloaded > PARLZ_PROXY_MAX_BYTES) ? 1 : 0;
    },
]);
if ($caFile !== '') {
    curl_setopt($ch, CURLOPT_CAINFO, $caFile);
}
$body = curl_exec($ch);
$type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$final = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
$error = curl_error($ch);
curl_close($ch);

if ($body === false && $caFile !== '') {
    $retry = curl_init($target);
    curl_setopt_array($retry, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => PARLZ_PROXY_MAX_HOPS,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ]);
    $body = curl_exec($retry);
    $type = (string)curl_getinfo($retry, CURLINFO_CONTENT_TYPE);
    $code = (int)curl_getinfo($retry, CURLINFO_RESPONSE_CODE);
    $final = (string)curl_getinfo($retry, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($retry);
    curl_close($retry);
}

if ($body === false) {
    proxy_fail('抓取失败：' . ($error !== '' ? $error : '网络不通'));
    }

while (ob_get_level() > 0) {
    ob_end_clean();
}

if ($code >= 400) {
    http_response_code($code);
}

$finalBase = $final !== '' ? $final : $target;
if (stripos($type, 'text/html') === false) {
    header('Content-Type: ' . ($type !== '' ? $type : 'application/octet-stream'));
    header('Cache-Control: no-store');
    echo $body;
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo proxy_rewrite($body, $finalBase);
