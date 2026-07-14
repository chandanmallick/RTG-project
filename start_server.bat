@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_PORT=8001"
set "FRONTEND_PORT=3001"

if /i "%~1"=="backend" goto backend
if /i "%~1"=="frontend" goto frontend

echo ==========================================
echo RTG Project Server Launcher
echo ==========================================
echo Project: %ROOT%
echo Backend: http://127.0.0.1:%BACKEND_PORT%
echo Frontend: http://127.0.0.1:%FRONTEND_PORT%
echo.

if not exist "%BACKEND_DIR%\main.py" (
  echo ERROR: Backend main.py not found at "%BACKEND_DIR%\main.py"
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo ERROR: Frontend package.json not found at "%FRONTEND_DIR%\package.json"
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python was not found in PATH.
  echo Install Python or activate the correct environment, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

echo Starting backend server...
start "RTG Backend API" cmd /k ""%~f0" backend"

echo Starting frontend server...
start "RTG Frontend" cmd /k ""%~f0" frontend"

echo.
echo Waiting for servers to start...
timeout /t 5 /nobreak >nul
start "" "http://127.0.0.1:%FRONTEND_PORT%"

echo.
echo Servers started in separate windows.
echo Close those windows to stop the backend/frontend servers.
echo.
pause
exit /b 0

:backend
echo Starting RTG Backend API on http://127.0.0.1:%BACKEND_PORT%
cd /d "%BACKEND_DIR%" || (
  echo Failed to enter backend directory.
  pause
  exit /b 1
)

if exist "%ROOT%.venv\Scripts\activate.bat" (
  call "%ROOT%.venv\Scripts\activate.bat"
) else if exist "%ROOT%.python313\Scripts\activate.bat" (
  call "%ROOT%.python313\Scripts\activate.bat"
)

python -m uvicorn main:app --host 0.0.0.0 --port %BACKEND_PORT% --reload
pause
exit /b %errorlevel%

:frontend
echo Starting RTG Frontend on http://127.0.0.1:%FRONTEND_PORT%
cd /d "%FRONTEND_DIR%" || (
  echo Failed to enter frontend directory.
  pause
  exit /b 1
)

echo Building frontend (generating optimized production bundle)...
call npm run build
if errorlevel 1 (
  echo ERROR: Failed to build frontend.
  pause
  exit /b 1
)

echo Starting production server (node server.cjs)...
node server.cjs
pause
exit /b %errorlevel%
