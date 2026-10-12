<?php

$root = __DIR__ . '/Resources/AppIcon.iconset';
$green = [0x00, 0xD9, 0x5F];
$ink = [0x0B, 0x24, 0x15];

if (!is_dir($root) && !mkdir($root, 0775, true) && !is_dir($root)) {
    throw new RuntimeException('无法创建 ' . $root);
}

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
    $scale = $size >= 256 ? 2 : 8;
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

$targets = [
    'icon_16x16.png' => 16,
    'icon_16x16@2x.png' => 32,
    'icon_32x32.png' => 32,
    'icon_32x32@2x.png' => 64,
    'icon_128x128.png' => 128,
    'icon_128x128@2x.png' => 256,
    'icon_256x256.png' => 256,
    'icon_256x256@2x.png' => 512,
    'icon_512x512.png' => 512,
    'icon_512x512@2x.png' => 1024,
];

foreach ($targets as $name => $size) {
    $img = draw($size);
    imagepng($img, $root . '/' . $name);
    imagedestroy($img);
    echo 'wrote AppIcon.iconset/' . $name . PHP_EOL;
}

$flat = draw(512);
imagepng($flat, __DIR__ . '/Resources/AppIcon.png');
imagedestroy($flat);
echo 'wrote Resources/AppIcon.png' . PHP_EOL;
