@echo off
title CampusGate AI - Push to GitHub
color 0A

echo ================================================================
echo           CAMPUSGATE AI - GITHUB PUSH WIZARD
echo ================================================================
echo.
echo Target Repository: https://github.com/piyushdussa123-wq/CAMPUS-GATE-.git
echo Branch: main
echo.
echo Pushing your project to GitHub...
echo (If a browser window or GitHub sign-in popup appears, please approve it)
echo.

git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ================================================================
    echo [SUCCESS] Your project was pushed to GitHub successfully!
    echo View repository at: https://github.com/piyushdussa123-wq/CAMPUS-GATE-
    echo ================================================================
) else (
    echo.
    echo [NOTE] If you saw an authentication error:
    echo 1. Ensure you are signed in as piyushdussa123-wq on GitHub.
    echo 2. If using a Personal Access Token (PAT), paste it when prompted for password.
)

echo.
pause
