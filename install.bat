@echo off
setlocal enabledelayedexpansion

set "VER=0.5.0"
set "SRC=%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Node.js not found. Install Node.js ^>= 18: https://nodejs.org
    pause
    exit /b 1
)

net session >nul 2>&1
if !errorlevel! equ 0 (set "DEST=%ProgramFiles%\Clinn") else (set "DEST=%LOCALAPPDATA%\Programs\Clinn")

echo   Clinn v!VER! Global Install
echo   Target: !DEST!

set "OLDKEY="
if exist "!DEST!\config.json" (
    for /f "tokens=1,* delims=:" %%A in ('findstr /c:"apiKey" "!DEST!\config.json"') do (
        for /f tokens^=* %%K in ("%%B") do set "OLDKEY=%%~K"
    )
    set "OLDKEY=!OLDKEY:"=!"
)

if exist "!DEST!" rmdir /s /q "!DEST!" >nul 2>&1
mkdir "!DEST!"

for %%D in (Src Tools Mem Logos) do (
    if exist "%SRC%%%D" robocopy "%SRC%%%D" "!DEST!\%%D" /E /NFL /NDL /NJH /NJS >nul 2>&1
)

copy /Y "%SRC%config.json" "!DEST!\config.json" >nul
if defined OLDKEY if not "!OLDKEY!"=="" if not "!OLDKEY!"=="YOUR_API_KEY" (
    powershell -NoProfile -Command "(Get-Content '!DEST!\config.json' -Raw) -replace '""apiKey"":\s*"".*?""', '""apiKey"": ""!OLDKEY!""' | Set-Content '!DEST!\config.json' -NoNewline" >nul 2>&1
)

mkdir "!DEST!\Tools\custom" >nul 2>&1

echo @echo off> "!DEST!\clinn.bat"
echo node "!DEST!\Src\index.js" %%*>> "!DEST!\clinn.bat"

echo %%PATH%% | find /i "!DEST!" >nul 2>&1
if !errorlevel! neq 0 (
    powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';!DEST!', 'User')" >nul 2>&1
)

echo   Done
echo   Run: clinn  (new terminal)
echo   Config: !DEST!\config.json
echo   Uninstall: rmdir /s /q "!DEST!"
endlocal
