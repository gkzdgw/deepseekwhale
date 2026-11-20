@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the Node.js version required by your DSH first.
  pause
  exit /b 1
)
node "%~dp0install.mjs" %*
set "INSTALL_RC=%ERRORLEVEL%"
pause
exit /b %INSTALL_RC%
