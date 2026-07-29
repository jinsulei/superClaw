@echo off
:: Compare the OpenClaw dist tree with a selected portable package without fixed machine paths.
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "SRC=%ROOT%\src-tauri\resources\runtime\openclaw\dist"
set "PKG=%~1"
if "%PKG%"=="" set "PKG=%ROOT%\..\SuperClaw_Desktop_Client\resources\runtime\openclaw\dist"

if not exist "%SRC%\" (
    echo Source dist directory not found: %SRC%
    exit /b 2
)
if not exist "%PKG%\" (
    echo Package dist directory not found: %PKG%
    echo Usage: %~nx0 ^<portable-package-openclaw-dist-path^>
    exit /b 2
)

echo === Source dist file count ===
dir /s /a-d "%SRC%" 2>nul | find "File(s)"
echo.

echo === Package dist file count ===
dir /s /a-d "%PKG%" 2>nul | find "File(s)"
echo.

echo === Check for missing files ===
set MISSING=0
for /f "delims=" %%f in ('dir /s /b /a-d "%SRC%"') do (
    set "rel=%%f"
    set "rel=!rel:%SRC%=!"
    if not exist "%PKG%\!rel!" (
        echo MISSING: !rel!
        set /a MISSING+=1
    )
)
echo Missing files: %MISSING%
echo.

echo === Check for extra files in package ===
set EXTRA=0
for /f "delims=" %%f in ('dir /s /b /a-d "%PKG%"') do (
    set "rel=%%f"
    set "rel=%%f"
    set "rel=!rel:%PKG%=!"
    if not exist "%SRC%\!rel!" (
        echo EXTRA: !rel!
        set /a EXTRA+=1
    )
)
echo Extra files: %EXTRA%
endlocal
