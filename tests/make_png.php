<?php
$im = imagecreatetruecolor(400, 300);
imagefill($im, 0, 0, imagecolorallocate($im, 250, 120, 60));
imagestring($im, 5, 30, 140, 'STICKER 400x300', imagecolorallocate($im, 20, 20, 20));
imagepng($im, $argv[1] ?? 'sticker-test.png');
imagedestroy($im);
echo 'ok' . PHP_EOL;
