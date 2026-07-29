# 清理 Windows 图标缓存，并提示当前仓库的 release 可执行文件路径。
# 必须以管理员身份运行

Write-Host "=== 清理 Windows 图标缓存 ===" -ForegroundColor Cyan
Write-Host "请确保已关闭 SuperClaw（任务管理器确认没有 superclaw.exe 进程）" -ForegroundColor Yellow
Write-Host "本脚本需要管理员权限。" -ForegroundColor Yellow
Write-Host ""

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误：请以管理员身份运行此脚本！" -ForegroundColor Red
    Write-Host "右键点击脚本 → 以管理员身份运行" -ForegroundColor Yellow
    exit 1
}

Write-Host "正在关闭 SuperClaw 进程..." -ForegroundColor Cyan
Get-Process superclaw -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "正在关闭 Windows 资源管理器..." -ForegroundColor Cyan
# 优雅关闭 explorer
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "正在删除图标缓存文件..." -ForegroundColor Cyan
$cachePaths = @(
    "$env:LOCALAPPDATA\IconCache.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache*",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db"
)

foreach ($pattern in $cachePaths) {
    Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item -Path $_.FullName -Force -ErrorAction Stop
            Write-Host ("  已删除: " + $_.Name) -ForegroundColor Green
        } catch {
            Write-Host ("  无法删除: " + $_.Name + " - " + $_.Exception.Message) -ForegroundColor Yellow
        }
    }
}

# 删除缩略图缓存（额外）
$thumbDb = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db"
Remove-Item -Path $thumbDb -Force -ErrorAction SilentlyContinue

# 重新启动资源管理器
Write-Host "正在重新启动资源管理器..." -ForegroundColor Cyan
Start-Process explorer

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Green
Write-Host ""
Write-Host "接下来请执行：" -ForegroundColor Yellow
Write-Host "1. 从开始菜单/任务栏取消固定旧的 SuperClaw 快捷方式" -ForegroundColor Yellow
Write-Host "2. 直接运行新编译的 exe：" -ForegroundColor Yellow
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseExe = Join-Path $repoRoot "src-tauri\target\release\superclaw.exe"
Write-Host ("   " + $releaseExe) -ForegroundColor White
Write-Host "3. 如果还是模糊，请右键 exe → 发送到 → 桌面快捷方式" -ForegroundColor Yellow
Write-Host "   然后从快捷方式启动" -ForegroundColor Yellow
