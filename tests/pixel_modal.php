<?php
$path = $argv[1];
$cx = (int)($argv[2] ?? 0);
$cy = (int)($argv[3] ?? 0);
$half = (int)($argv[4] ?? 4);
$im = imagecreatefrompng($path);
$w = imagesx($im);
$h = imagesy($im);
$tally = [];
for ($y = max(0, $cy - $half); $y <= min($h - 1, $cy + $half); $y++) {
  for ($x = max(0, $cx - $half); $x <= min($w - 1, $cx + $half); $x++) {
    $c = imagecolorsforindex($im, imagecolorat($im, $x, $y));
    $hex = sprintf('%02X%02X%02X', $c['red'], $c['green'], $c['blue']);
    $tally[$hex] = ($tally[$hex] ?? 0) + 1;
  }
}
arsort($tally);
echo strtoupper((string)array_key_first($tally)) . ' ' . json_encode(array_slice($tally, 0, 3, true)) . PHP_EOL;
