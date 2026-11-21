@echo off
REM Publishes this folder to https://github.com/MTahaOfficial/vendor-crm-v2
REM A browser window may open once so you can sign in to GitHub.
cd /d "%~dp0"
git init
git add .
git commit -m "Vendor CRM v2: AI insights from vendor-customer chats"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/MTahaOfficial/vendor-crm-v2.git
git push -u origin main
echo.
echo Done. Open https://github.com/MTahaOfficial/vendor-crm-v2
pause
