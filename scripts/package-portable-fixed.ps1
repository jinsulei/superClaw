<#
.SYNOPSIS
    Deprecated SuperClaw portable package entrypoint.

.DESCRIPTION
    This legacy script is intentionally disabled for Hermes 1.0.7 packaging.
    Older versions copied local runtime caches and user data into the portable
    package path. Use scripts/build-desktop-client.ps1 as the only supported
    portable EXE baseline.
#>

$ErrorActionPreference = "Stop"

Write-Error "Deprecated legacy packaging script. Use: powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/build-desktop-client.ps1 -SkipRuntimeDownload -SanitizedTest"
exit 1
