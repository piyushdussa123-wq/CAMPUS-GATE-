@echo off
title CampusGate AI - Static Frontend Local Runner
color 0B

echo ================================================================
echo           CAMPUSGATE AI - STATIC FRONTEND RUNNER
echo ================================================================
echo.

set PYTHON_EXE=C:\Users\LENOVO\AppData\Local\Programs\Python\Python311\python.exe

if not exist "%PYTHON_EXE%" (
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set PYTHON_EXE=python
    ) else (
        echo [ERROR] Python was not found!
        pause
        exit /b 1
    )
)

echo Starting Static Frontend HTTP Server on port 8080...
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080"

"%PYTHON_EXE%" -m http.server 8080 -d static_frontend

pause
