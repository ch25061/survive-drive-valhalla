@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-valhalla.ps1"
if errorlevel 1 (
  echo Local Valhalla did not start. See README.md in this folder.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8003/"
