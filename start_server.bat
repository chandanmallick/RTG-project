@echo off
setlocal
cd /d "%~dp0"
echo RTG - refresh and start the local checkout
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_server.ps1"
set "LAUNCH_EXIT=%ERRORLEVEL%"
if not "%LAUNCH_EXIT%"=="0" echo Startup failed. Review the error and runtime logs.
pause
exit /b %LAUNCH_EXIT%
