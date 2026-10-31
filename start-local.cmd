@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node scripts\serve-local.mjs
  goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:8787/games/chess-auto.html
  py -m http.server 8787 --bind 127.0.0.1
  goto :end
)
echo.
echo 需要 Node.js 或 Python 才能在本机起服务。
echo 也可以用 VS Code 的 Live Server，或者把整个文件夹丢进任意静态服务器。
echo.
pause
:end
