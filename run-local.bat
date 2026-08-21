@echo off
rem Double-click this to run the Gridfinity Label Creator locally.
rem Starts a local static server (needed so the browser can fetch standards.json)
rem and opens it in your default browser. Close this window to stop the server.
cd /d "%~dp0"
start "" http://localhost:8765
python -m http.server 8765
