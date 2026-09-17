@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js 20+ is required.
  echo Opening https://nodejs.org/  — install the LTS build, then run this file again.
  echo.
  start https://nodejs.org/
  pause
  exit /b 1
)
node scripts\open-dev.mjs
if errorlevel 1 pause
