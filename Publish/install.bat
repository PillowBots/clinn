@echo off
setlocal enabledelayedexpansion

set "CLINN_HOME=%USERPROFILE%\.clinn"

echo.
echo   Clinn Installer
echo   ----------------
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   Node.js not found. Please install Node.js ^>= 18
    echo   https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set "NODE_MAJOR=%%a"
if %NODE_MAJOR% lss 18 (
    echo   Node.js version is too low. Requires ^>= 18
    pause
    exit /b 1
)

echo   Node.js is ready
echo   Install source: %~dp0

if exist "%CLINN_HOME%" (
    echo   Updating existing installation...
    rmdir /s /q "%CLINN_HOME%"
)

mkdir "%CLINN_HOME%"
xcopy /e /i /q "%~dp0Src"    "%CLINN_HOME%\Src"
xcopy /e /i /q "%~dp0Tools"  "%CLINN_HOME%\Tools"
xcopy /e /i /q "%~dp0Mem"    "%CLINN_HOME%\Mem"
xcopy /e /i /q "%~dp0Logos"  "%CLINN_HOME%\Logos"
copy /y "%~dp0config.json"   "%CLINN_HOME%\config.json"

echo @node "%CLINN_HOME%\Src\index.js" %%* > "%CLINN_HOME%\clinn.bat"

setx PATH "%PATH%;%CLINN_HOME%" >nul 2>&1

echo.
echo   Installation completed!
echo.
echo   Start:     clinn
echo   Configure: notepad %CLINN_HOME%\config.json  (Set API Key)
echo   Model:     Default deepseek-chat
echo.
echo   Important: Please edit %CLINN_HOME%\config.json and add your DeepSeek API Key!
echo.
echo   Please restart your terminal or PC for changes to take effect.
echo.
pause
