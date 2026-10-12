@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install --no-audit --no-fund
)
node server.js
pause
