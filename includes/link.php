<?php

declare(strict_types=1);

function link_normalize(string $raw): string
{
    $url = trim($raw);
    if (mb_strlen($url) > 500) {
        return '';
    }
    if (preg_match('#^https?://#i', $url) !== 1) {
        return '';
    }
    return $url;
}

function link_host_allowed(string $url): bool
{
    $parts = parse_url($url);
    if (!is_array($parts)) {
        return false;
    }
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    if ($scheme !== 'http' && $scheme !== 'https') {
        return false;
    }
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($host === '' || $host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
        return false;
    }

    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
        $ips[] = $host;
    } else {
        $resolved = @gethostbynamel($host);
        foreach (is_array($resolved) ? $resolved : [] as $ip) {
            $ips[] = $ip;
        }
    }
    if ($ips === []) {
        return false;
    }
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
    }
    return true;
}

function link_to_utf8(string $html): string
{
    if (preg_match('#charset\s*=\s*["\']?\s*([a-z0-9_\-]+)#i', substr($html, 0, 4096), $match) !== 1) {
        return $html;
    }
    $charset = strtoupper($match[1]);
    $convertible = ['GBK', 'GB2312', 'GB18030', 'BIG5', 'ISO-8859-1', 'WINDOWS-1252'];
    if ($charset === 'UTF-8' || !in_array($charset, $convertible, true)) {
        return $html;
    }
    $converted = @mb_convert_encoding($html, 'UTF-8', $charset);
    return is_string($converted) ? $converted : $html;
}

function link_meta(string $html, string $key): string
{
    $quoted = preg_quote($key, '#');
    if (preg_match('#<meta[^>]+(?:property|name)\s*=\s*["\']' . $quoted . '["\'][^>]*>#i', $html, $tag) !== 1) {
        return '';
    }
    if (preg_match('#content\s*=\s*["\']([^"\']*)["\']#i', $tag[0], $match) !== 1) {
        return '';
    }
    return html_entity_decode($match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function link_clean(string $value, int $max): string
{
    $text = trim((string)preg_replace('/\s+/u', ' ', $value));
    if (mb_strlen($text) > $max) {
        $text = mb_substr($text, 0, $max) . '…';
    }
    return $text;
}

function link_absolutize(string $pageUrl, string $value): string
{
    $url = trim($value);
    if ($url === '') {
        return '';
    }
    if (str_starts_with($url, '//')) {
        $scheme = parse_url($pageUrl, PHP_URL_SCHEME);
        return ($scheme === null ? 'https' : (string)$scheme) . ':' . $url;
    }
    if (preg_match('#^https?://#i', $url) === 1) {
        return $url;
    }
    $parts = parse_url($pageUrl);
    if (!is_array($parts)) {
        return '';
    }
    $base = (string)($parts['scheme'] ?? 'https') . '://' . (string)($parts['host'] ?? '');
    if (str_starts_with($url, '/')) {
        return $base . $url;
    }
    $path = (string)($parts['path'] ?? '/');
    $slash = strrpos($path, '/');
    return $base . ($slash === false ? '/' : substr($path, 0, $slash + 1)) . $url;
}

function link_parse_html(string $pageUrl, string $html): array
{
    $title = '';
    foreach (['og:title', 'twitter:title'] as $key) {
        $title = link_meta($html, $key);
        if ($title !== '') {
            break;
        }
    }
    if ($title === '' && preg_match('#<title[^>]*>(.*?)</title>#is', $html, $match) === 1) {
        $title = $match[1];
    }

    $description = '';
    foreach (['og:description', 'twitter:description', 'description'] as $key) {
        $description = link_meta($html, $key);
        if ($description !== '') {
            break;
        }
    }

    $image = '';
    foreach (['og:image:secure_url', 'og:image', 'twitter:image'] as $key) {
        $image = link_meta($html, $key);
        if ($image !== '') {
            break;
        }
    }

    $site = '';
    foreach (['og:site_name', 'application-name'] as $key) {
        $site = link_meta($html, $key);
        if ($site !== '') {
            break;
        }
    }

    $host = (string)(parse_url($pageUrl, PHP_URL_HOST) ?? '');
    if ($site === '') {
        $site = $host;
    }

    return [
        'url' => $pageUrl,
        'title' => link_clean($title, 120),
        'description' => link_clean($description, 220),
        'image' => link_absolutize($pageUrl, $image),
        'site' => link_clean($site, 60),
        'host' => $host,
    ];
}

function link_ca_file(): string
{
    $candidates = [
        PARLZ_CA_FILE,
        'C:/Program Files/Git/mingw64/ssl/certs/ca-bundle.crt',
        'C:/Program Files/Git/usr/ssl/certs/ca-bundle.crt',
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/pki/tls/certs/ca-bundle.crt',
        '/usr/local/etc/openssl/cert.pem',
    ];
    foreach ($candidates as $path) {
        if ($path !== '' && is_file($path)) {
            return $path;
        }
    }
    return '';
}

function link_http_get(string $url, ?string $caFile): array
{
    $body = '';
    $ch = curl_init($url);
    $options = [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => 7,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; ParlzLinkBot/1.0; +link preview)',
        CURLOPT_ENCODING => '',
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int {
            $body .= $chunk;
            return strlen($body) > 262144 ? 0 : strlen($chunk);
        },
    ];
    if ($caFile !== null && $caFile !== '') {
        $options[CURLOPT_CAINFO] = $caFile;
    } else {
        $options[CURLOPT_SSL_VERIFYPEER] = false;
        $options[CURLOPT_SSL_VERIFYHOST] = 0;
    }
    curl_setopt_array($ch, $options);
    curl_exec($ch);
    $result = [
        'body' => $body,
        'status' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'type' => (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE),
        'effective' => (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL),
        'error' => (int)curl_errno($ch),
    ];
    curl_close($ch);
    return $result;
}

function link_fetch(string $url): array
{
    if (!link_host_allowed($url)) {
        return [];
    }

    $caFile = link_ca_file();
    $result = link_http_get($url, $caFile === '' ? null : $caFile);
    if ($result['body'] === '' && $caFile !== '' && in_array($result['error'], [51, 60, 77], true)) {
        $result = link_http_get($url, null);
    }

    $body = (string)$result['body'];
    $status = (int)$result['status'];
    $type = (string)$result['type'];
    $effective = (string)$result['effective'];

    if ($body === '' || $status >= 400 || $status === 0) {
        return [];
    }
    if ($type !== '' && stripos($type, 'html') === false && stripos($type, 'xml') === false) {
        return [];
    }
    if ($effective !== '' && !link_host_allowed($effective)) {
        return [];
    }

    $card = link_parse_html($effective !== '' ? $effective : $url, link_to_utf8(substr($body, 0, 262144)));
    if ($card['title'] === '' && $card['description'] === '' && $card['image'] === '') {
        return [];
    }
    return $card;
}

function link_card_get(string $url): ?array
{
    $stmt = db()->prepare('SELECT url, title, description, image, site, fetched_at FROM link_cards WHERE url = ?');
    $stmt->execute([$url]);
    $row = $stmt->fetch();
    if ($row === false) {
        return null;
    }
    $empty = $row['title'] === '' && $row['image'] === '';
    if ((int)$row['fetched_at'] + ($empty ? 3600 : 604800) < time()) {
        return null;
    }
    if ($empty) {
        return [];
    }
    return [
        'url' => $row['url'],
        'title' => $row['title'],
        'description' => $row['description'],
        'image' => $row['image'],
        'site' => $row['site'],
        'host' => (string)(parse_url($row['url'], PHP_URL_HOST) ?? ''),
    ];
}

function link_card_save(string $url, array $card): void
{
    db()->prepare('INSERT INTO link_cards (url, title, description, image, site, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            image = excluded.image,
            site = excluded.site,
            fetched_at = excluded.fetched_at')
        ->execute([
            $url,
            (string)($card['title'] ?? ''),
            (string)($card['description'] ?? ''),
            (string)($card['image'] ?? ''),
            (string)($card['site'] ?? ''),
            time(),
        ]);
}
