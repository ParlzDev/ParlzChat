<?php

declare(strict_types=1);

const PARLZ_IOS_HOST = 'chat.parlz.com';
const PARLZ_IOS_IPA = '/assets/uploads/parlz-ios-1.0.4.ipa';
const PARLZ_IOS_BUNDLE = 'com.parlz.chatter';
const PARLZ_IOS_VERSION = '1.0.4';
const PARLZ_IOS_BUILD = '4';
const PARLZ_IOS_TITLE = 'Parlz';

$base = 'https://' . PARLZ_IOS_HOST;

if (isset($_GET['manifest'])) {
    header('Content-Type: application/xml; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' . "\n";
    echo '<plist version="1.0"><dict><key>items</key><array><dict>' . "\n";
    echo '<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>'
        . htmlspecialchars($base . PARLZ_IOS_IPA, ENT_XML1) . '</string></dict></array>' . "\n";
    echo '<key>metadata</key><dict>'
        . '<key>bundle-identifier</key><string>' . PARLZ_IOS_BUNDLE . '</string>'
        . '<key>bundle-version</key><string>' . PARLZ_IOS_BUILD . '</string>'
        . '<key>kind</key><string>software</string>'
        . '<key>title</key><string>' . PARLZ_IOS_TITLE . '</string>'
        . '</dict></dict></array></dict></plist>' . "\n";
    exit;
}

$manifest = $base . '/ios.php?manifest=1';
$install = 'itms-services://?action=download-manifest&url=' . rawurlencode($manifest);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>安装 Parlz for iPhone</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eefcf4;color:#0b2415;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:420px}
.badge{width:96px;height:96px;border-radius:22px;background:#00d95f;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
.bubble{width:58%;height:40%;border-radius:14px;background:#0b2415;display:flex;align-items:center;justify-content:center;gap:6px}
.dot{width:9px;height:9px;border-radius:50%;background:#00d95f}
h1{font-size:24px;text-align:center;margin-bottom:6px}
p.sub{text-align:center;color:#3f6b52;font-size:14px;margin-bottom:26px}
a.install{display:block;background:#00d95f;color:#0b2415;text-align:center;padding:16px;border-radius:14px;font-size:18px;font-weight:700;text-decoration:none}
ol{margin:26px 0 0;padding-left:20px;font-size:14px;line-height:1.9;color:#28503a}
li b{color:#0b2415}
.note{margin-top:20px;background:#d8f5e4;border-radius:12px;padding:14px;font-size:13px;line-height:1.7;color:#28503a}
</style>
</head>
<body>
<div class="card">
<div class="badge"><div class="bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div>
<h1>Parlz for iPhone</h1>
<p class="sub">版本 <?= PARLZ_IOS_VERSION ?> · 需要 iOS 15 或更高</p>
<a class="install" href="<?= htmlspecialchars($install, ENT_QUOTES) ?>">安装 / 覆盖重装 Parlz</a>
<ol>
<li>必须用 <b>Safari</b> 打开本页（微信/QQ 内置浏览器不行）</li>
<li>点上面的按钮，弹窗里选「<b>安装</b>」</li>
<li>回到桌面等它装完</li>
</ol>
<div class="note">
<b>已经装过旧版？</b>直接点上面的按钮就是覆盖重装，聊天记录不丢。<br><br>
装完首次打开若提示「未受信任的开发者」：<br>
设置 → 通用 → VPN与设备管理 → 信任你的开发者账号<br><br>
本 App 只能装到已登记 UDID 的设备上，换新手机需要重新登记。
</div>
</div>
</body>
</html>
