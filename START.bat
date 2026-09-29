@echo off
title KMR Studio
cd /d "%~dp0"
if exist "runtime\ready.txt" goto run
echo.
echo  First start: downloading Node.js, FFmpeg and the voice engine.
echo  This happens only once and takes about 5 to 10 minutes.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if not errorlevel 1 goto run
echo.
echo  Setup did not finish. Check your internet connection and double-click START.bat again.
pause
exit /b 1

:run
set "PATH=%~dp0runtime\node;%~dp0runtime\ffmpeg\bin;%~dp0runtime\python;%~dp0runtime\python\Scripts;%PATH%"
set "LUMEN_PYTHON=%~dp0runtime\python\python.exe"
if "%~1"=="silent" goto loop
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3456"
echo.
echo  KMR Studio is running. Keep this window open (you can minimize it).
echo  Dashboard: http://localhost:3456
echo.

:loop
node server.js
echo  Restarting KMR Studio...
timeout /t 2 /nobreak >nul
goto loop
