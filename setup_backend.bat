@echo off
setlocal
cd /d "%~dp0"
echo Preparing the project Python environment...
python -m venv .venv
if errorlevel 1 goto failed
if "%~1"=="" (
  echo Installing declared backend dependencies from the configured package index...
  ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
) else (
  echo Installing only from the supplied offline wheel folder...
  ".venv\Scripts\python.exe" -m pip install --no-index --find-links "%~1" -r backend\requirements.txt
)
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip check
if errorlevel 1 goto failed
".venv\Scripts\python.exe" backend\scripts\check_database_config.py
if errorlevel 1 goto failed
echo Backend environment is ready. Run start_server.bat.
exit /b 0
:failed
echo Backend setup failed. Review the error above.
exit /b 1
