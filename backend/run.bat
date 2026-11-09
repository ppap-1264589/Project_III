@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.10 or newer, then run this file again.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating this project's local Python environment...
  python -m venv .venv
  if errorlevel 1 exit /b 1
)

echo Checking backend dependencies...
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo Starting the API. Open http://127.0.0.1:8000/docs to try the Excel upload.
call ".venv\Scripts\python.exe" -m uvicorn app.main:app --reload
