@echo off
setlocal
set "DESK_NODE=node"
where node >nul 2>&1
if errorlevel 1 set "DESK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%DESK_NODE%" "%~dp0local-plus\stop-local.mjs"
if errorlevel 1 pause
