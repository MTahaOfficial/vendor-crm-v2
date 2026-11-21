@echo off
REM Vendor CRM - one-click start (Windows). Uses a built-in database, no PostgreSQL install needed.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages ^(first run only^)...
  call npm install
)
if not exist dist (
  echo Building the web app...
  call npm run build
)
start "" /b cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:4100"
call npm run start:local
pause
