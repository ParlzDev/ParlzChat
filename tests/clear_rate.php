<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$n = db()->exec("DELETE FROM rate_limits WHERE key LIKE 'register%' OR key LIKE 'email_send%' OR key LIKE 'email_rebind%' OR key LIKE 'reset%' OR key LIKE 'face_%' OR key LIKE 'group_%'");
echo 'cleared=' . (int)$n . PHP_EOL;
