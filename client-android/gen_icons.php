<?php

$root = __DIR__ . '/app/src/main/res';
$green = [0x00, 0xD9, 0x5F];
$ink = [0x0B, 0x24, 0x15];

function color($img, array $rgb): int
{
    return imagecolorallocate($img, $rgb[0], $rgb[1], $rgb[2]);
}

function rounded_rect_alpha($img, int $x1, int $y1, int $x2, int $y2, int $r, int $color): void
{
    imagefilledrectangle($img, $x1 + $r, $y1, $x2 - $r, $y2, $color);
    imagefilledrectangle($img, $x1, $y1 + $r, $x2, $y2 - $r, $color);
    imagefilledellipse($img, $x1 + $r, $y1 + $r, 2 * $r, 2 * $r, $color);
    imagefilledellipse($img, $x2 - $r, $y1 + $r, 2 * $r, 2 * $r, $color);
    imagefilledellipse($img, $x1 + $r, $y2 - $r, 2 * $r, 2 * $r, $color);
    imagefilledellipse($img, $x2 - $r, $y2 - $r, 2 * $r, 2 * $r, $color);
}

function draw_icon(int $size, bool $with_bg): \GdImage
{
    global $root, $green, $ink;
    $scale = 8;
    $dim = $size * $scale;
    $img = imagecreatetruecolor($dim, $dim);
    imagealphablending($img, false);
    imagesavealpha($img, true);
    $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
    imagefill($img, 0, 0, $transparent);
    imagealphablending($img, true);

    $greenC = color($img, $green);
    $inkC = color($img, $ink);

    if ($with_bg) {
        rounded_rect_alpha($img, 0, 0, $dim - 1, $dim - 1, (int)($dim * 0.22), $greenC);
        $bw = 0.56;
        $bh = 0.42;
        $cx = 0.5;
        $cy = 0.46;
    } else {
        $bw = 0.42;
        $bh = 0.32;
        $cx = 0.5;
        $cy = 0.5;
    }

    $bx1 = (int)($dim * ($cx - $bw / 2));
    $bx2 = (int)($dim * ($cx + $bw / 2));
    $by1 = (int)($dim * ($cy - $bh / 2));
    $by2 = (int)($dim * ($cy + $bh / 2));
    $radius = (int)(($by2 - $by1) * 0.34);
    rounded_rect_alpha($img, $bx1, $by1, $bx2, $by2, $radius, $inkC);

    $tailX = (int)($dim * ($cx - $bw * 0.18));
    $tailY = $by2;
    imagefilledpolygon($img, [
        $tailX, $tailY - (int)($dim * 0.01),
        $tailX + (int)($dim * 0.05), $tailY - (int)($dim * 0.01),
        $tailX + (int)($dim * 0.01), $tailY + (int)($dim * 0.075),
    ], $greenC === $inkC ? $greenC : $greenC);

    $dotR = (int)(($by2 - $by1) * 0.085);
    $dotY = (int)(($by1 + $by2) / 2);
    $gap = (int)(($bx2 - $bx1) * 0.20);
    foreach ([-1, 0, 1] as $i) {
        $dotX = (int)(($bx1 + $bx2) / 2) + $i * $gap;
        imagefilledellipse($img, $dotX, $dotY, 2 * $dotR, 2 * $dotR, $greenC);
    }

    $out = imagecreatetruecolor($size, $size);
    imagealphablending($out, false);
    imagesavealpha($out, true);
    imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
    imagealphablending($out, true);
    imagecopyresampled($out, $img, 0, 0, 0, 0, $size, $size, $dim, $dim);
    imagedestroy($img);
    return $out;
}

$legacy = ['mdpi' => 48, 'hdpi' => 72, 'xhdpi' => 96, 'xxhdpi' => 144, 'xxxhdpi' => 192];
foreach ($legacy as $density => $size) {
    $dir = $root . '/mipmap-' . $density;
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    $img = draw_icon($size, true);
    imagepng($img, $dir . '/ic_launcher.png');
    imagedestroy($img);
    echo 'wrote ' . $dir . '/ic_launcher.png' . PHP_EOL;
}

$foreground = ['mdpi' => 108, 'hdpi' => 162, 'xhdpi' => 216, 'xxhdpi' => 324, 'xxxhdpi' => 432];
foreach ($foreground as $density => $size) {
    $dir = $root . '/mipmap-' . $density;
    $img = draw_icon($size, false);
    imagepng($img, $dir . '/ic_launcher_fg.png');
    imagedestroy($img);
    echo 'wrote ' . $dir . '/ic_launcher_fg.png' . PHP_EOL;
}
