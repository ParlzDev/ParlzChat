<?php

declare(strict_types=1);

function image_from_upload(string $tmpPath): GdImage|false
{
    $raw = (string)file_get_contents($tmpPath);
    if ($raw === '') {
        return false;
    }
    $image = @imagecreatefromstring($raw);
    if ($image === false) {
        return false;
    }
    return image_apply_exif($image, $tmpPath);
}

function image_apply_exif(GdImage $image, string $tmpPath): GdImage
{
    $data = @exif_read_data($tmpPath, 'IFD0');
    $orientation = (int)($data['Orientation'] ?? 0);
    $angle = match ($orientation) {
        3 => 180,
        6 => -90,
        8 => 90,
        default => 0,
    };
    if ($angle === 0) {
        return $image;
    }
    $rotated = imagerotate($image, $angle, 0);
    if ($rotated === false) {
        return $image;
    }
    imagedestroy($image);
    return $rotated;
}

function image_save_webp(GdImage $source, string $dest, int $maxSide, int $quality, bool $square): bool
{
    $width = imagesx($source);
    $height = imagesy($source);
    if ($width < 1 || $height < 1) {
        return false;
    }

    $sourceW = $width;
    $sourceH = $height;
    $sourceX = 0;
    $sourceY = 0;
    if ($square) {
        $side = min($width, $height);
        $sourceX = intdiv($width - $side, 2);
        $sourceY = intdiv($height - $side, 2);
        $sourceW = $side;
        $sourceH = $side;
    }

    $scale = $maxSide / max($sourceW, $sourceH);
    if ($scale > 1) {
        $scale = 1;
    }
    $targetW = max(1, (int)round($sourceW * $scale));
    $targetH = max(1, (int)round($sourceH * $scale));

    $out = imagecreatetruecolor($targetW, $targetH);
    imagealphablending($out, false);
    imagesavealpha($out, true);
    imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
    imagecopyresampled($out, $source, 0, 0, $sourceX, $sourceY, $targetW, $targetH, $sourceW, $sourceH);
    $saved = imagewebp($out, $dest, $quality);
    imagedestroy($out);
    return $saved;
}

function image_receive(string $field): GdImage
{
    $file = $_FILES[$field] ?? null;
    if (!is_array($file) || (int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail('没有收到上传的图片');
    }
    if (!is_uploaded_file((string)$file['tmp_name'])) {
        fail('上传校验失败');
    }
    if ((int)$file['size'] < 1) {
        fail('文件内容为空');
    }
    if ((int)$file['size'] > PARLZ_IMAGE_MAX_BYTES) {
        fail('图片不能超过 ' . (int)round(PARLZ_IMAGE_MAX_BYTES / 1048576) . 'MB');
    }
    $image = image_from_upload((string)$file['tmp_name']);
    if ($image === false) {
        fail('这不是有效的图片文件');
    }
    return $image;
}
