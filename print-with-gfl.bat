@echo off
rem Double-click this to switch the PT-D600 into GFL print mode and launch
rem everything needed: rebinds the USB driver to libusbK (Windows will show
rem an admin prompt - click Yes), then starts the local web server and the
rem print agent, and opens the app in your browser.
rem
rem When you're done and want P-touch Editor again, run
rem restore-normal-printing.bat instead.
cd /d "%~dp0"

echo Switching PT-D600 to GFL (libusbK) mode...
echo A Windows admin prompt will appear - click Yes to allow the driver switch.
powershell -NoProfile -Command "$p = Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0print-agent\switch-driver.ps1\" -Target libusbk' -Wait -PassThru; exit $p.ExitCode"
if errorlevel 1 (
  echo.
  echo Driver switch failed or was cancelled. Log:
  type "%~dp0print-agent\switch-driver.log"
  pause
  exit /b 1
)

start "GFL web app" cmd /c "%~dp0run-local.bat"
start "GFL print agent" cmd /k "cd /d "%~dp0print-agent" && uv run agent.py"
