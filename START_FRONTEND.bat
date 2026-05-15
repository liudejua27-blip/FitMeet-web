@echo off
chcp 65001 >nul
echo ========================================
echo 🎨 启动前端服务
echo ========================================
echo.

cd frontend

echo [1/2] 安装依赖...
call pnpm install
if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo.
echo [2/2] 启动前端开发服务器...
echo.
echo ✅ 前端将在 http://localhost:5173 启动
echo.

call pnpm run dev
