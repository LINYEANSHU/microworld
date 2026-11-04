@echo off
rem MicroWorld launcher - delegates to PowerShell for Unicode-safe handling
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch.ps1" %*
