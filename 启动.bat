@echo off
chcp 65001 >nul
title 作业提交系统
echo ==================================================
echo   作业提交系统 - 正在启动...
echo ==================================================
echo.

:: 获取本机局域网 IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set LOCAL_IP=%%a
    goto :show_ip
)
:show_ip
echo   本机访问: http://localhost:8080
echo   局域网访问: http:%LOCAL_IP: =%:8080
echo.
echo   提示: 首次使用请先右键运行"配置防火墙.bat"（管理员）
echo   按 Ctrl+C 停止服务器
echo ==================================================
echo.

python server.py
pause
