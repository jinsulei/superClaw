@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem Shared portable document CLI for Hermes, OpenClaw, and Claude Code.
set "TOOL_DIR=%~dp0"
for %%I in ("%TOOL_DIR%..") do set "RUNTIME_DIR=%%~fI"
set "PYTHON_EXE="
for /d %%D in ("%RUNTIME_DIR%\uv-python\*") do (
  if not defined PYTHON_EXE if exist "%%~fD\python.exe" set "PYTHON_EXE=%%~fD\python.exe"
)
if not defined PYTHON_EXE (
  echo Portable Python is unavailable. 1>&2
  exit /b 2
)
set "PYTHONPATH=%RUNTIME_DIR%\hermes-agent\Lib\site-packages"
"%PYTHON_EXE%" "%TOOL_DIR%hermes_document_tool.py" %*
exit /b %ERRORLEVEL%
