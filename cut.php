<?php

declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>Parlz · 截图</title>
<script src="<?= asset('assets/scripts/theme-boot.js') ?>"></script>
<link rel="stylesheet" href="<?= asset('assets/style/base.css') ?>">
<link rel="stylesheet" href="<?= asset('assets/style/components.css') ?>">
<style>
.cut-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 28px 24px;
  text-align: center;
}
.cut-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 92px;
  height: 92px;
  border-radius: 22px;
  background: var(--green);
  color: var(--on-green);
}
.cut-mark svg {
  width: 46px;
  height: 46px;
  fill: currentColor;
}
.cut-title {
  font-size: 22px;
  font-weight: 700;
}
.cut-note {
  max-width: 430px;
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.9;
}
.cut-keys {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.cut-key {
  padding: 4px 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 12px;
  color: var(--green-ink);
}
</style>
</head>
<body>
<div class="cut-page">
  <div class="cut-mark">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm14 0v5h-5v-2h3v-3z"/><path d="M3 11.2h18v1.6H3z"/></svg>
  </div>
  <div class="cut-title">Parlz 截图</div>
  <p class="cut-note">
    点下面的按钮开始（或直接按 <b>Enter</b>）。先在屏幕上框选区域，再用工具栏标注：<br>
    矩形 / 椭圆 / 箭头 / 画笔 / 文字 / 马赛克，五档颜色，可撤销。<br>
    完成后可保存到本地、复制到剪贴板；在聊天里打开时还能直接发送。
  </p>
  <div class="cut-keys">
    <span class="cut-key">Enter 开始截屏</span>
    <span class="cut-key">Ctrl+Z 撤销</span>
    <span class="cut-key">Esc 取消</span>
  </div>
  <button class="btn btn-primary" type="button" id="cut-start">开始截屏</button>
</div>
<script type="module">
  import { boot } from '<?= asset('assets/scripts/cut.js') ?>';
  boot();
</script>
</body>
</html>
