@echo off
setlocal enabledelayedexpansion

set "CLINN_HOME=%USERPROFILE%\.clinn"

echo.
echo   Clinn 安装程序
echo   --------------
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo   (x.x) 未找到 Node.js，请先安装 Node.js ^>= 18
  echo   https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% lss 18 (
  echo   (x.x) Node.js 版本过低，需要 ^>= 18
  pause
  exit /b 1
)

echo   (^.^)b Node.js 已就绪
echo   安装源: %~dp0

if exist "%CLINN_HOME%" (
  echo   更新现有安装...
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
echo   (^.^)b 安装完成!
echo.
echo   启动:     clinn
echo   配置:     notepad %CLINN_HOME%\config.json  (设置 API Key)
echo   模型:     默认 deepseek-chat
echo.
echo   重要: 请先编辑 %CLINN_HOME%\config.json 填入 DeepSeek API Key!
echo.
echo   重新打开终端或重启后生效。
echo.
pause
