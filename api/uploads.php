<?php

declare(strict_types=1);

require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/image.php';

$user = require_user();
require_post();
rate_guard('upload', (string)$user['id'], 20, 60);

function clean_file_name(string $name): string
{
    $clean = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F]/u', '', $name);
    $clean = trim((string)$clean);
    return $clean === '' ? '文件' : mb_substr($clean, 0, 100);
}

if (isset($_FILES['image'])) {
    $upload = $_FILES['image'];
    $tmp = (string)($upload['tmp_name'] ?? '');
    $size = (int)($upload['size'] ?? 0);
    if (is_uploaded_file($tmp)) {
        $info = @getimagesize($tmp);
        if ($info !== false && (int)($info[2] ?? 0) === IMAGETYPE_GIF) {
            if ($size <= 0 || $size > PARLZ_IMAGE_MAX_BYTES) {
                fail('图片不能超过 ' . (int)(PARLZ_IMAGE_MAX_BYTES / 1048576) . 'MB');
            }
            ensure_upload_dir();
            $gifName = 'm' . (int)$user['id'] . '-' . bin2hex(random_bytes(8)) . '.gif';
            if (!move_uploaded_file($tmp, PARLZ_UPLOAD_DIR . '/' . $gifName)) {
                fail('图片保存失败，请检查 assets/uploads 目录写入权限');
            }
            json_out(['ok' => true, 'kind' => 'image', 'file' => $gifName]);
        }
    }
    $image = image_receive('image');
    ensure_upload_dir();
    $name = 'm' . (int)$user['id'] . '-' . bin2hex(random_bytes(8)) . '.webp';
    $saved = image_save_webp($image, PARLZ_UPLOAD_DIR . '/' . $name, PARLZ_IMAGE_MAX_SIDE, PARLZ_IMAGE_QUALITY, false);
    imagedestroy($image);
    if ($saved === false) {
        fail('图片保存失败，请检查 assets/uploads 目录写入权限');
    }
    json_out(['ok' => true, 'kind' => 'image', 'file' => $name]);
}

$upload = $_FILES['file'] ?? null;
$error = is_array($upload) ? (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
    fail('文件太大，服务器拒绝了这次上传，请调大 PHP 的 upload_max_filesize / post_max_size');
}
if (!is_array($upload) || $error !== UPLOAD_ERR_OK) {
    fail('请选择要上传的文件');
}
if (!is_uploaded_file((string)($upload['tmp_name'] ?? ''))) {
    fail('上传校验失败');
}

$original = (string)($upload['name'] ?? '');
$size = (int)($upload['size'] ?? 0);
if ($size <= 0) {
    fail('不能发送空文件');
}
if ($size > PARLZ_FILE_MAX_BYTES) {
    fail('文件不能超过 ' . (int)(PARLZ_FILE_MAX_BYTES / 1048576) . 'MB');
}

$ext = strtolower((string)pathinfo($original, PATHINFO_EXTENSION));
if ($ext !== '' && preg_match('/^[a-z0-9]{1,10}$/', $ext) !== 1) {
    fail('文件扩展名不合法');
}
if (in_array($ext, PARLZ_FILE_BLOCKED, true)) {
    fail('不支持这种文件类型');
}

ensure_upload_dir();
$name = 'f' . (int)$user['id'] . '-' . bin2hex(random_bytes(8)) . ($ext === '' ? '' : '.' . $ext);
if (!move_uploaded_file((string)$upload['tmp_name'], PARLZ_UPLOAD_DIR . '/' . $name)) {
    fail('文件保存失败，请检查 assets/uploads 目录写入权限');
}

json_out(['ok' => true, 'kind' => 'file', 'file' => $name, 'name' => clean_file_name($original), 'size' => $size]);
