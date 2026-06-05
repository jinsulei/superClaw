@echo off
chcp 65001 >nul
title SuperClaw Portable Packager

echo ========================================
echo   SuperClaw Portable Package Builder
echo ========================================
echo.

:: Project root and output directories
set ROOT=%~dp0..
set OUT_TEMP=%ROOT%\SuperClaw_SuiShenBan
set CN_NAME=SuperClaw_随身版
set OUT_FINAL=%ROOT%\%CN_NAME%

:: Remove old temp directory
if exist "%OUT_TEMP%" (
    echo [INFO] Removing old temp directory...
    rmdir /s /q "%OUT_TEMP%" 2>nul
)

:: ─── Step 1: Build ────────────────────────────────────────────────
set EXE_SRC=%ROOT%\src-tauri\target\release\superclaw.exe
if exist "%EXE_SRC%" (
    echo [1/4] Skipping build - superclaw.exe already exists
    echo   %EXE_SRC%
    echo   ^(delete it first to force rebuild^)
    goto :STEP2
)

echo [1/4] Building frontend and Rust backend...
cd /d "%ROOT%" || exit /b 1
call npm run tauri build
if errorlevel 1 (
    echo [ERROR] npm run tauri build failed ^(code %ERRORLEVEL%^)
    echo.
    echo Possible causes:
    echo   - Rust/Cargo build error
    echo   - Frontend build error ^(run 'npm run build' separately^)
    echo   - File locked by another process
    pause
    exit /b 1
)
if not exist "%EXE_SRC%" (
    echo [ERROR] Build OK but superclaw.exe not found:
    echo   %EXE_SRC%
    pause
    exit /b 1
)
echo [DONE] Build successful
echo.

:STEP2
:: ─── Step 2: Create output directory ─────────────────────────────
echo [2/4] Creating portable directory...
mkdir "%OUT_TEMP%"
if errorlevel 1 (
    echo [ERROR] Failed to create output directory
    pause
    exit /b 1
)
echo [DONE]
echo.

:: ─── Step 3: Copy components ─────────────────────────────────────
echo [3/4] Copying components...
echo.

:: --- bin/ ---
if exist "%ROOT%\bin\*" (
    mkdir "%OUT_TEMP%\resources\bin" 2>nul
    robocopy "%ROOT%\bin" "%OUT_TEMP%\resources\bin" /E /R:3 /W:5 /NP /NDL /NFL /NJH /NJS >nul
    if errorlevel 8 (echo   [WARN] bin/ copy issue) else (echo   [OK] bin/)
) else (
    echo   [SKIP] bin/ not found
)

:: --- uv-tools/ ---
if exist "%ROOT%\uv-tools\*" (
    mkdir "%OUT_TEMP%\resources\uv-tools" 2>nul
    robocopy "%ROOT%\uv-tools" "%OUT_TEMP%\resources\uv-tools" /E /R:3 /W:5 /NP /NDL /NFL /NJH /NJS >nul
    if errorlevel 8 (echo   [WARN] uv-tools/ copy issue) else (echo   [OK] uv-tools/)
) else (
    echo   [SKIP] uv-tools/ not found
)

:: --- uv-python/ ---
if exist "%ROOT%\uv-python\*" (
    mkdir "%OUT_TEMP%\resources\uv-python" 2>nul
    robocopy "%ROOT%\uv-python" "%OUT_TEMP%\resources\uv-python" /E /R:3 /W:5 /NP /NDL /NFL /NJH /NJS >nul
    if errorlevel 8 (echo   [WARN] uv-python/ copy issue) else (echo   [OK] uv-python/)
) else (
    echo   [SKIP] uv-python/ not found
)

:: --- data/ ---
if exist "%ROOT%\data\*" (
    mkdir "%OUT_TEMP%\resources\data" 2>nul
    robocopy "%ROOT%\data" "%OUT_TEMP%\resources\data" /E /R:3 /W:5 /NP /NDL /NFL /NJH /NJS >nul
    if errorlevel 8 (echo   [WARN] data/ copy issue) else (echo   [OK] data/)
) else (
    echo   [SKIP] data/ not found
)

:: --- openclaw runtime ---
set RUNTIME_SRC=%ROOT%\src-tauri\resources\runtime\openclaw
echo.
if exist "%RUNTIME_SRC%\*" (
    mkdir "%OUT_TEMP%\resources\runtime\openclaw" 2>nul
    robocopy "%RUNTIME_SRC%" "%OUT_TEMP%\resources\runtime\openclaw" /E /R:3 /W:5 /NP /NDL /NFL /NJH /NJS >nul
    if errorlevel 8 (echo   [WARN] openclaw runtime copy issue) else (echo   [OK] openclaw runtime/)
) else (
    echo   [SKIP] openclaw runtime/ not found
)

:: --- clawpanel.json ---
mkdir "%OUT_TEMP%\resources\data\.openclaw" 2>nul
copy /y "%ROOT%\src-tauri\resources\data\.openclaw\clawpanel.json" "%OUT_TEMP%\resources\data\.openclaw\clawpanel.json" >nul 2>nul
echo   [OK] .openclaw/clawpanel.json

:: --- Clean runtime artifacts ---
echo.
echo   Cleaning runtime artifacts for portability...
if exist "%OUT_TEMP%\resources\data\hermes" (
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\sessions" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\logs" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\audio_cache" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\image_cache" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\memories" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\pairing" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\skills" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\cron" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\hermes\hooks" 2>nul
    del "%OUT_TEMP%\resources\data\hermes\gateway.lock" 2>nul
    del "%OUT_TEMP%\resources\data\hermes\gateway.pid" 2>nul
    del "%OUT_TEMP%\resources\data\hermes\gateway_state.json" 2>nul
    del "%OUT_TEMP%\resources\data\hermes\gateway-run.log" 2>nul
    del "%OUT_TEMP%\resources\data\hermes\auth.lock" 2>nul
    del "%OUT_TEMP%\resources\data\hermes\.skills_prompt_snapshot.json" 2>nul
)
if exist "%OUT_TEMP%\resources\data\.openclaw" (
    del "%OUT_TEMP%\resources\data\.openclaw\clawpanel-device-key.json" 2>nul
    del "%OUT_TEMP%\resources\data\.openclaw\gateway-owner.json" 2>nul
    del "%OUT_TEMP%\resources\data\.openclaw\openclaw.json" 2>nul
    del "%OUT_TEMP%\resources\data\.openclaw\openclaw.json.bak" 2>nul
    del "%OUT_TEMP%\resources\data\.openclaw\openclaw.json.last-good" 2>nul
    del "%OUT_TEMP%\resources\data\.openclaw\update-check.json" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\.openclaw\agents" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\.openclaw\canvas" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\.openclaw\devices" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\.openclaw\identity" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\.openclaw\logs" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\.openclaw\tasks" 2>nul
    rmdir /s /q "%OUT_TEMP%\resources\data\.openclaw\workspace" 2>nul
)
echo   [OK] cleaned runtime artifacts
echo [DONE]
echo.

:: ─── Step 4: Copy exe ────────────────────────────────────────────
echo [4/4] Copying superclaw.exe...
copy /y "%EXE_SRC%" "%OUT_TEMP%\superclaw.exe" >nul
if not exist "%OUT_TEMP%\superclaw.exe" (
    echo [ERROR] Copy failed!
    pause
    exit /b 1
)
echo   [OK] superclaw.exe
echo [DONE]
echo.

:: ─── Step 5: Rename to Chinese name ──────────────────────────────
echo [5/5] Finalizing portable directory name...
if exist "%OUT_FINAL%" (
    echo   Removing old directory...
    rmdir /s /q "%OUT_FINAL%" 2>nul
)
ren "%OUT_TEMP%" "%CN_NAME%" >nul 2>&1
if exist "%OUT_FINAL%" (
    echo   [OK] Renamed to "%CN_NAME%"
) else (
    echo   [WARN] cmd rename failed, trying PowerShell...
    powershell -NoProfile -Command "Rename-Item -Path '%OUT_TEMP%' -NewName '%CN_NAME%' -ErrorAction Stop"
    if exist "%OUT_FINAL%" (
        echo   [OK] Renamed via PowerShell
    ) else (
        echo   [ERROR] Rename failed! Output at: %OUT_TEMP%
        echo   Manually rename to: %CN_NAME%
    )
)
echo [DONE]
echo.

:: ─── Verification ────────────────────────────────────────────────
echo ========================================
echo   Verification
echo ========================================
echo.
set TOTAL=0
for /f %%i in ('dir /s /a-d "%OUT_FINAL%" 2^>nul ^| findstr /c:"File(s)"') do set TOTAL=%%i
echo Output: %OUT_FINAL%
echo Total files: %TOTAL%
if exist "%OUT_FINAL%\superclaw.exe" (echo   [OK] superclaw.exe) else (echo   [MISSING] superclaw.exe)
if exist "%OUT_FINAL%\resources\runtime\openclaw\openclaw.cmd" (echo   [OK] openclaw.cmd) else (echo   [MISSING] openclaw.cmd)
echo.
echo ========================================
echo   Packaging complete!
echo ========================================
echo.
pause
