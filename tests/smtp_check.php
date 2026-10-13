<?php

declare(strict_types=1);

$host = $argv[1] ?? 'smtp.parlz.com';
$ips = gethostbynamel($host);
echo 'dns=' . ($ips === false ? 'FAIL' : implode(',', $ips)) . PHP_EOL;
foreach ([25, 587, 465, 2525] as $port) {
    $errno = 0;
    $errstr = '';
    $start = microtime(true);
    $fp = @stream_socket_client('tcp://' . $host . ':' . $port, $errno, $errstr, 6.0);
    $ms = (int)round((microtime(true) - $start) * 1000);
    if ($fp === false) {
        echo 'port ' . $port . ' FAIL ' . $errstr . ' (' . $ms . 'ms)' . PHP_EOL;
        continue;
    }
    stream_set_timeout($fp, 6);
    $banner = (string)fgets($fp, 512);
    echo 'port ' . $port . ' OK ' . trim($banner) . ' (' . $ms . 'ms)' . PHP_EOL;
    fclose($fp);
}
