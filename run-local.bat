@echo off
rem Double-click this to run the Gridfinity Label Creator locally.
rem Starts a local static server (needed so the browser can fetch standards.json)
rem plus the image-catalog agent (needed for Icon -> Photo uploads), and opens
rem the app in your default browser. Close this window to stop the static
rem server; close the "GFL image agent" window to stop uploads.
cd /d "%~dp0"
start "GFL image agent" /min python "%~dp0image-agent\agent.py"
start "" http://localhost:8765
python -m http.server 8765
