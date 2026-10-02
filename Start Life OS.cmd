@echo off
rem Double-click to start Life OS. Keep this window open while you use it.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies (first run only^)...
  call npm install || goto :fail
)
call npm start || goto :fail
exit /b 0
:fail
echo.
echo Life OS could not start. The error is shown above.
pause
