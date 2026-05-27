@echo off
REM Double-click to reclaim Rust build-cache space (removes target/debug, keeps
REM the release exe + shortcut). For a full wipe run:  powershell .\clean.ps1 -All
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0clean.ps1"
echo.
pause
