@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Install the current Node.js LTS from nodejs.org.
  pause
  exit /b 1
)
echo Starting AthleteConnect. Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
node scripts/demo.js --open
pause
