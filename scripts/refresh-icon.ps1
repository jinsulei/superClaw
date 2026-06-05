# 刷新 Windows 图标缓存
# 需要管理员权限运行
# 用法：右键 → 以管理员身份运行

Write-Host "=== 刷新 Windows 图标缓存 ===" -ForegroundColor Cyan

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误：请以管理员身份运行此脚本！" -ForegroundColor Red
    Write-Host "右键点击 → 以管理员身份运行" -ForegroundColor Yellow
    pause
    exit 1
}

# 1. 确保 SuperClaw 已关闭
Write-Host "[1/4] 关闭 SuperClaw 进程..." -ForegroundColor Cyan
Get-Process superclaw -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 2. 清理 cargo 构建缓存中的旧资源文件
Write-Host "[2/4] 清理 Windows 图标缓存..." -ForegroundColor Cyan

# 停止 explorer（这会关闭任务栏和桌面图标）
Write-Host "  正在停止 Windows 资源管理器..." -ForegroundColor Yellow
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 删除图标缓存数据库
$cacheFiles = @(
    "$env:LOCALAPPDATA\IconCache.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache*",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db"
)

$deletedCount = 0
foreach ($pattern in $cacheFiles) {
    Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item -Path $_.FullName -Force -ErrorAction Stop
            Write-Host ("  已删除: " + $_.Name) -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host ("  无法删除: " + $_.Name + " - " + $_.Exception.Message) -ForegroundColor Yellow
        }
    }
}

if ($deletedCount -eq 0) {
    Write-Host "  未找到图标缓存文件（可能已被清除）" -ForegroundColor Yellow
}

# 3. 重新启动资源管理器
Write-Host "[3/4] 重新启动 Windows 资源管理器..." -ForegroundColor Cyan
Start-Process explorer
Start-Sleep -Seconds 2

# 4. 完成
Write-Host "[4/4] 完成！" -ForegroundColor Green
Write-Host ""
Write-Host "=== 接下来 ===" -ForegroundColor Yellow
Write-Host "1. 找到新编译的 exe：" -ForegroundColor White
Write-Host "   c:\Users\ZXKJ\Documents\SuperClaw\clawpanel-main\src-tauri\target\release\superclaw.exe" -ForegroundColor Cyan
Write-Host "2. 右键 → 固定到任务栏" -ForegroundColor White
Write-Host "3. 从任务栏启动，确认图标是否清晰" -ForegroundColor White
Write-Host ""
Write-Host "提示：如果还看到旧图标，可以注销 Windows 后重新登录。" -ForegroundColor Yellow

pause
