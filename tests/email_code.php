<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';

$email = (string)($argv[1] ?? '');
$purpose = (string)($argv[2] ?? '');
if ($email === '') {
    exit(2);
}
$sql = 'SELECT code FROM email_codes WHERE email = ?';
$args = [$email];
if ($purpose !== '') {
    $sql .= ' AND purpose = ?';
    $args[] = $purpose;
}
$stmt = db()->prepare($sql . ' ORDER BY id DESC LIMIT 1');
$stmt->execute($args);
$code = $stmt->fetchColumn();
echo ($code === false ? 'none' : (string)$code) . PHP_EOL;
