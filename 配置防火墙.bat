@echo off
chcp 65001 >nul
title 作业提交系统 - 防火墙配置（需要管理员权限）

echo ==================================================
echo   正在配置防火墙规则（允许局域网访问 8080 端口）
echo ==================================================
echo.

netsh advfirewall firewall show rule name="作业提交系统8080" dir=in >nul 2>&1
if %errorlevel%==0 (
    echo [OK] 防火墙规则已存在，无需重复添加
) else (
    netsh advfirewall firewall add rule name="作业提交系统8080" dir=in action=allow protocol=TCP localport=8080 profile=private,domain
    if %errorlevel%==0 (
        echo [OK] 防火墙规则添加成功
    ) else (
        echo [错误] 添加失败，请右键此文件选择"以管理员身份运行"
    )
)

echo.
echo 按任意键退出...
pause >nul
