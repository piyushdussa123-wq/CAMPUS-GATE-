@echo off
title CampusGate AI - College Gate Attendance System
color 0B

echo ================================================================
echo           CAMPUSGATE AI - COLLEGE GATE SCANNER SYSTEM
echo ================================================================
echo.

set PYTHON_EXE=C:\Users\LENOVO\AppData\Local\Programs\Python\Python311\python.exe

if not exist "%PYTHON_EXE%" (
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set PYTHON_EXE=python
    ) else (
        echo [ERROR] Python 3.11 was not found!
        echo Please ensure Python is installed.
        pause
        exit /b 1
    )
)

echo [1/3] Python detected: %PYTHON_EXE%
echo [2/3] Starting Gate Attendance Server on port 5000...

:: Open browser after 2 seconds in parallel
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:5000"

:: Start Flask server
"%PYTHON_EXE%" app.py

pause
