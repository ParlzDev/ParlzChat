<?php

$root = __DIR__ . '/resources/icons';
$green = [0x00, 0xD9, 0x5F];
$ink = [0x0B, 0x24, 0x15];

function color($img, array $rgb): int
{
    return imagecolorallocate($img, $rgb[0], $rgb[1], $rgb[2]);
}

function rounded_rect($img, int $x1, int $y1, int $x2, int $y2, int $r, int $color): void
{
    imagefilledrectangle($img, $x1 + $r, $y1, $x2 - $r, $y2, $color);
    imagefilledrectangle($img, $x1, $y1 + $r, $x2, $y2 - $r, $color);
    imagefilledellipse($img, $x1 + $r, $y1 + $r, 2 * $r, 2 * $r, $color);
    imagefilledellipse($img, $x2 - $r, $y1 + $r, 2 * $r, 2 * $r, $color);
    imagefilledellipse($img, $x1 + $r, $y2 - $r, 2 * $r, 2 * $r, $color);
    imagefilledellipse($img, $x2 - $r, $y2 - $r, 2 * $r, 2 * $r, $color);
}

function draw(int $size): \GdImage
{
    global $green, $ink;
    $scale = $size >= 512 ? 2 : 8;
    $dim = $size * $scale;
    $img = imagecreatetruecolor($dim, $dim);
    imagealphablending($img, false);
    imagesavealpha($img, true);
    imagefill($img, 0, 0, imagecolorallocatealpha($img, 0, 0, 0, 127));
    imagealphablending($img, true);

    $greenC = color($img, $green);
    $inkC = color($img, $ink);

    rounded_rect($img, 0, 0, $dim - 1, $dim - 1, (int)($dim * 0.22), $greenC);

    $bx1 = (int)($dim * 0.22);
    $bx2 = (int)($dim * 0.78);
    $by1 = (int)($dim * 0.30);
    $by2 = (int)($dim * 0.62);
    rounded_rect($img, $bx1, $by1, $bx2, $by2, (int)(($by2 - $by1) * 0.34), $inkC);

    $tailX = (int)($dim * 0.34);
    imagefilledpolygon($img, [
        $tailX, $by2 - (int)($dim * 0.01),
        $tailX + (int)($dim * 0.10), $by2 - (int)($dim * 0.01),
        $tailX + (int)($dim * 0.02), $by2 + (int)($dim * 0.11),
    ], $greenC);

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

if (!is_dir($root)) {
    mkdir($root, 0777, true);
}

foreach ([16, 24, 32, 48, 64, 128, 256, 512] as $size) {
    $img = draw($size);
    imagepng($img, $root . '/parlz-' . $size . '.png');
    imagedestroy($img);
    echo 'wrote resources/icons/parlz-' . $size . '.png' . PHP_EOL;
}

copy($root . '/parlz-256.png', __DIR__ . '/resources/parlz.png');
echo 'wrote resources/parlz.png' . PHP_EOL;
