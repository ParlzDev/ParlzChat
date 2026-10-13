<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

echo 'ready=' . (stt_ready() ? 'yes' : 'no') . ' api=' . (stt_api_ready() ? 'yes' : 'no') . ' provider=' . stt_provider() . PHP_EOL;
$bytes = str_repeat('x', 2048);
$text = stt_transcribe($bytes, 'zh', 'f1-abcdef0123456789.webm');
echo 'text=' . $text . PHP_EOL;
