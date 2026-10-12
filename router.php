<?php

declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = is_string($path) ? rawurldecode($path) : '/';

if (str_contains($path, '..') || str_contains($path, "\0")) {
    http_response_code(400);
    echo 'Bad Request';
    return true;
}

$blocked = ['/data/', '/includes/', '/tests/', '/config.php', '/router.php'];
foreach ($blocked as $needle) {
    if (str_starts_with($path, $needle)) {
        http_response_code(404);
        echo 'Not Found';
        return true;
    }
}

if ($path === '/' || $path === '/index.php') {
    require __DIR__ . '/index.php';
    return true;
}

$file = __DIR__ . $path;
if (is_file($file)) {
    if (str_starts_with($path, '/assets/uploads/')) {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $inline = [
            'webp' => 'image/webp',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
            'mov' => 'video/quicktime',
            'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav',
            'm4a' => 'audio/mp4',
            'aac' => 'audio/aac',
            'ogg' => 'audio/ogg',
            'oga' => 'audio/ogg',
        ];
        if (isset($inline[$ext])) {
            header('Content-Type: ' . $inline[$ext]);
        } else {
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . rawurlencode(basename($path)) . '"');
        }
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: public, max-age=604800');
        header('Accept-Ranges: bytes');
        $size = (int)filesize($file);
        $start = 0;
        $end = $size - 1;
        $partial = false;
        $range = trim((string)($_SERVER['HTTP_RANGE'] ?? ''));
        if ($range !== '' && preg_match('/^bytes=(\d*)-(\d*)$/', $range, $m)) {
            if ($m[1] === '' && $m[2] !== '') {
                $start = max(0, $size - (int)$m[2]);
            } else {
                $start = (int)$m[1];
                if ($m[2] !== '') {
                    $end = (int)$m[2];
                }
            }
            if ($start >= $size || $start > $end) {
                http_response_code(416);
                header('Content-Range: bytes */' . $size);
                return true;
            }
            $end = min($end, $size - 1);
            $partial = true;
        }
        if ($partial) {
            http_response_code(206);
            header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
            header('Content-Length: ' . (string)($end - $start + 1));
        } else {
            header('Content-Length: ' . (string)$size);
        }
        $fp = fopen($file, 'rb');
        if ($fp !== false) {
            if ($start > 0) {
                fseek($fp, $start);
            }
            $remaining = $end - $start + 1;
            while ($remaining > 0 && !feof($fp)) {
                $chunk = fread($fp, (int)min(262144, $remaining));
                if ($chunk === false || $chunk === '') {
                    break;
                }
                echo $chunk;
                $remaining -= strlen($chunk);
            }
            fclose($fp);
        }
        return true;
    }
    if (str_ends_with($path, '.php')) {
        return false;
    }
    $types = [
        'css' => 'text/css; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'ico' => 'image/x-icon',
    ];
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if (!isset($types[$ext])) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not Found';
        return true;
    }
    header('Content-Type: ' . $types[$ext]);
    if ($ext === 'css' || $ext === 'js') {
        header('Cache-Control: no-store, must-revalidate');
    } else {
        header('Cache-Control: public, max-age=604800');
    }
    header('Content-Length: ' . (string)filesize($file));
    readfile($file);
    return true;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Not Found';
return true;
