@echo off
title CampusGate AI - Public HTTPS Deployment Runner
color 0A

echo ================================================================
echo           CAMPUSGATE AI - PUBLIC HTTPS DEPLOYMENT RUNNER
echo ================================================================
echo.

set PYTHON_EXE=C:\Users\LENOVO\AppData\Local\Programs\Python\Python311\python.exe

if not exist "%PYTHON_EXE%" (
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set PYTHON_EXE=python
    ) else (
        echo [ERROR] Python 3.11 was not found!
        pause
        exit /b 1
    )
)

echo [1/3] Starting Local Face Scanning Server (Port 5000)...
start /b "" "%PYTHON_EXE%" app.py

echo Waiting for server to initialize...
timeout /t 3 /nobreak >nul

echo [2/3] Launching Secure Cloudflare HTTPS Tunnel...
if not exist "cloudflared.exe" (
    echo [ERROR] cloudflared.exe not found in current folder!
    pause
    exit /b 1
)

echo.
echo ================================================================
echo Starting public tunnel. Look for your https://*.trycloudflare.com URL below:
echo ================================================================
echo.

.\cloudflared.exe tunnel --protocol http2 --url http://127.0.0.1:5000

pause
