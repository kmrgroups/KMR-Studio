@echo off
rem Makes KMR Studio start automatically (minimized) whenever you log in to Windows.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%STARTUP%\KMR Studio.bat"
if exist "%STARTUP%\Lumen Studio.bat" del "%STARTUP%\Lumen Studio.bat"
> "%TARGET%" echo @echo off
>> "%TARGET%" echo start "KMR Studio" /min "%~dp0START.bat" silent
echo.
echo  Done. KMR Studio will start by itself every time you log in.
echo  To undo, delete "KMR Studio.bat" from:
echo  %STARTUP%
echo.
pause
