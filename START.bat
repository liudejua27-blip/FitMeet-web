@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

echo ========================================
echo Fitness app dev stack
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-dev.ps1"
if errorlevel 1 (
    echo.
    echo Startup failed. Check the message above.
    pause
    exit /b 1
)

echo.
echo Startup requested successfully.
echo Backend log:  backend-dev.log
echo Frontend log: frontend-dev.log
echo.
pause
