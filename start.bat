@echo off
cd /d "%~dp0"
start "Parlz PHP" cmd /k "C:\tools\php85\php.exe -d upload_max_filesize=72M -d post_max_size=80M -S 127.0.0.1:8137 router.php"
start "Parlz TURN" cmd /k "cd /d %~dp0turn && node server.js"
echo 已启动两个窗口：网站 (http://127.0.0.1:8137) 与 TURN 中继 (3478/udp)
echo 关掉对应窗口即停止对应服务。
