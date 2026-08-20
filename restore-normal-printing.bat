@echo off
rem Restoring the Brother driver for P-touch Editor isn't reliably
rem automatable (see RESTORE-PRINTER-INSTRUCTIONS.txt for why) -- this
rem just opens the instructions and jumps you to Device Manager.
cd /d "%~dp0"
start "" notepad "%~dp0RESTORE-PRINTER-INSTRUCTIONS.txt"
start "" devmgmt.msc
