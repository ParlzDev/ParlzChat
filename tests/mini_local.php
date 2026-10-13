<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$code = '$greeting = "hi " . strtoupper("parlz"); echo $greeting; foreach ([1, 2, 3] as $n) { echo $n . "-"; } if (count([1,2]) == 2) { echo "yes"; } else { echo "no"; }';
$result = miniapp_run_pphp($code, []);
echo 'out=' . $result['out'] . PHP_EOL;
echo 'vars=' . json_encode($result['vars'], JSON_UNESCAPED_UNICODE) . PHP_EOL;

$files = [
    'phtml' => '<h2>{{ greeting }}</h2><p>{{ me.nickname }}</p>',
    'pphp' => '$greeting = "你好 " . strtoupper("parlz");',
];
echo 'render=' . miniapp_render($files, ['me' => ['nickname' => '小明']]) . PHP_EOL;
