@echo off
rem MicroWorld launcher (CPU-only rendering, no GPU) - for machines busy with training
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch.ps1" -NoGpu %*
