@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/2] 检查依赖...
py -m pip install --disable-pip-version-check -q -i https://pypi.tuna.tsinghua.edu.cn/simple pillow pyinstaller || goto :err
echo [2/2] 打包...
py -m PyInstaller --noconfirm --clean --onefile --windowed ^
  --name "国象应招器" --icon "..\chess\build\icon.ico" chess_assist.py || goto :err
echo.
echo 完成：%~dp0dist\国象应招器.exe
pause
exit /b 0
:err
echo 打包失败，看上面的日志。
pause
exit /b 1
