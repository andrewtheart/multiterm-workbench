@echo off
setlocal

if not "%~1"=="" goto forward_arguments

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-MultiTerm.ps1" -ConsoleDashboard -NewInstance
exit /b %ERRORLEVEL%

:forward_arguments
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-MultiTerm.ps1" %*
exit /b %ERRORLEVEL%
