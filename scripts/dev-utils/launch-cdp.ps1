$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Set-Location "C:\Users\ZXKJ\Documents\SuperClaw_Desktop_Client"
$proc = Start-Process -FilePath ".\superclaw.exe" -PassThru
Write-Output ("STARTED_PID=" + $proc.Id)
