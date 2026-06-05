@echo off
chcp 65001 >nul
set SRC=c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\resources\runtime\openclaw\dist
set PKG=c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\SuperClaw_随身版\resources\runtime\openclaw\dist

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
    set "rel=rel:%PKG%=!"
    if not exist "%SRC%\!rel!" (
        echo EXTRA: !rel!
        set /a EXTRA+=1
    )
)
echo Extra files: %EXTRA%
pause
