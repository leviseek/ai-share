@echo off
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0aiomo-monitor.ps1" %*
