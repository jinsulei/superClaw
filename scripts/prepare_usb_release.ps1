<#
.SYNOPSIS
    Prepare a clean USB-ready SuperClaw folder from the tested release output.

.DESCRIPTION
    This script intentionally packages from src-tauri/target/release only. The
    root-level dependency folders may contain stale development paths, while the
    release resources are the copy that has already passed local runtime checks.
#>

param(
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$SRC = Join-Path $ROOT "src-tauri\target\release"
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OUT = Join-Path $ROOT "SuperClaw_USB"
} else {
    if ([System.IO.Path]::IsPathRooted($OutputDir)) {
        $OUT = $OutputDir
    } else {
        $OUT = Join-Path $ROOT $OutputDir
    }
}

function Get-FullPath([string]$Path) {
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-ChildPath([string]$Parent, [string]$Child) {
    $parentFull = Get-FullPath $Parent
    $childFull = Get-FullPath $Child
    $prefix = $parentFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $childFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe output path outside project root: $childFull"
    }
    if ($childFull -eq $parentFull) {
        throw "Unsafe output path equals project root: $childFull"
    }
}

function Remove-SafeDirectory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }
    Assert-ChildPath -Parent $ROOT -Child $Path
    Remove-Item -LiteralPath $Path -Recurse -Force
}

function Remove-IfExists([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Reset-Directory([string]$Path) {
    Remove-IfExists $Path
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Copy-Mirror([string]$From, [string]$To) {
    if (-not (Test-Path -LiteralPath $From)) {
        throw "Missing source directory: $From"
    }
    New-Item -ItemType Directory -Path $To -Force | Out-Null
    & robocopy $From $To /MIR /R:2 /W:1 /NP /NFL /NDL /NJH /NJS | Out-Null
    $code = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($code -ge 8) {
        throw "robocopy failed ($code): $From -> $To"
    }
}

function Count-Skills([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return 0
    }
    return @(Get-ChildItem -LiteralPath $Path -Recurse -Filter "SKILL.md" -File -ErrorAction SilentlyContinue).Count
}

function Ensure-HermesSkills([string]$SkillsDir) {
    $count = Count-Skills $SkillsDir
    if ($count -ge 20) {
        return $count
    }

    $candidates = @(
        (Join-Path $ROOT "src-tauri\resources\data\hermes\skills"),
        (Join-Path $ROOT "data\hermes-source\hermes-agent-main\skills"),
        (Join-Path $SRC "resources\data\hermes\skills")
    )

    foreach ($candidate in $candidates) {
        $candidateCount = Count-Skills $candidate
        if ($candidateCount -ge 20) {
            Copy-Mirror -From $candidate -To $SkillsDir
            return (Count-Skills $SkillsDir)
        }
    }

    throw "Hermes offline skills seed is missing or incomplete"
}

function Clean-HermesData([string]$HermesData) {
    if (-not (Test-Path -LiteralPath $HermesData)) {
        throw "Missing Hermes data directory: $HermesData"
    }

    foreach ($name in @("logs", "sessions", "cache", "audio_cache", "image_cache", "memories", "pairing", "cron", "hooks")) {
        Reset-Directory (Join-Path $HermesData $name)
    }

    foreach ($name in @("gateway.lock", "gateway.pid", "gateway_state.json", "gateway-run.log", "auth.lock", ".skills_prompt_snapshot.json", ".update_check", "tmp_healthcheck.txt", ".env")) {
        Remove-IfExists (Join-Path $HermesData $name)
    }

    Get-ChildItem -LiteralPath $HermesData -Force -File -Filter "config.yaml.bak*" -ErrorAction SilentlyContinue | Remove-Item -Force
    Get-ChildItem -LiteralPath $HermesData -Force -File -Filter "*.db-shm" -ErrorAction SilentlyContinue | Remove-Item -Force
    Get-ChildItem -LiteralPath $HermesData -Force -File -Filter "*.db-wal" -ErrorAction SilentlyContinue | Remove-Item -Force
}

function Clean-HermesInstallMetadata([string]$ResourcesRoot) {
    $sitePackages = Join-Path $ResourcesRoot "uv-tools\hermes-agent\Lib\site-packages"
    if (-not (Test-Path -LiteralPath $sitePackages)) {
        return
    }

    Get-ChildItem -LiteralPath $sitePackages -Recurse -Force -File -Filter "direct_url.json" -ErrorAction SilentlyContinue |
        ForEach-Object {
            [System.IO.File]::WriteAllText($_.FullName, '{"url":"","dir_info":{}}' + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
        }

    $activateBat = Join-Path $ResourcesRoot "uv-tools\hermes-agent\Scripts\activate.bat"
    if (Test-Path -LiteralPath $activateBat) {
        $text = [System.IO.File]::ReadAllText($activateBat)
        $text = [regex]::Replace(
            $text,
            '@for %%i in \(".*?"\) do @set "VIRTUAL_ENV=%%~fi"',
            '@for %%i in ("%~dp0..") do @set "VIRTUAL_ENV=%%~fi"'
        )
        [System.IO.File]::WriteAllText($activateBat, $text, (New-Object System.Text.UTF8Encoding($false)))
    }
}

function Remove-ForbiddenDeliveryFiles([string]$OutRoot) {
    $forbiddenFiles = @(".env", "history.jsonl", "settings.local.json")
    $forbiddenPatterns = @("*.rejected.*", "openclaw.json.rejected.*", "*.pid", "*.lock", "*.log")

    foreach ($name in $forbiddenFiles) {
        Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -File -Filter $name -ErrorAction SilentlyContinue |
            ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
    }

    foreach ($pattern in $forbiddenPatterns) {
        Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
            ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
    }

    Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -Directory -Filter ".claude" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
}

function Test-NoForbiddenDeliveryFiles([string]$OutRoot) {
    $hits = New-Object System.Collections.Generic.List[string]
    foreach ($name in @(".env", "history.jsonl", "settings.local.json")) {
        Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -File -Filter $name -ErrorAction SilentlyContinue |
            ForEach-Object { $hits.Add($_.FullName.Substring($OutRoot.Length).TrimStart('\', '/')) }
    }
    foreach ($pattern in @("*.rejected.*", "openclaw.json.rejected.*")) {
        Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
            ForEach-Object { $hits.Add($_.FullName.Substring($OutRoot.Length).TrimStart('\', '/')) }
    }
    Get-ChildItem -LiteralPath $OutRoot -Recurse -Force -Directory -Filter ".claude" -ErrorAction SilentlyContinue |
        ForEach-Object { $hits.Add($_.FullName.Substring($OutRoot.Length).TrimStart('\', '/')) }

    if ($hits.Count -gt 0) {
        throw "Forbidden delivery files found: $($hits -join '; ')"
    }
}

function Test-NoKeyLeaks([string]$OutRoot) {
    $patterns = @(
        "sk-[A-Za-z0-9_-]{20,}",
        "sk-proj-[A-Za-z0-9_-]{20,}",
        "(?i)(OPENAI|ANTHROPIC|CUSTOM|API)_?API_?KEY\s*[:=]\s*['""]?[^'""\s]{12,}",
        "(?i)Authorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._-]{20,}"
    )
    $relativeTargets = @(
        "resources\data\hermes\config.yaml",
        "resources\data\hermes\SOUL.md",
        "resources\data\hermes\channel_directory.json",
        "resources\data\.openclaw\openclaw.json",
        "resources\data\.openclaw\clawpanel.json",
        "resources\uv-tools\hermes-agent\uv-receipt.toml",
        "resources\uv-tools\hermes-agent\pyvenv.cfg",
        "resources\uv-python\python\Lib\site-packages\hermes-agent.pth",
        "resources\runtime\openclaw\openclaw.cmd"
    )
    $hits = New-Object System.Collections.Generic.List[string]

    foreach ($relative in $relativeTargets) {
        $path = Join-Path $OutRoot $relative
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }
        try {
            $text = [System.IO.File]::ReadAllText($path)
            foreach ($pattern in $patterns) {
                if ([regex]::IsMatch($text, $pattern)) {
                    $hits.Add($relative)
                    break
                }
            }
        } catch {}
    }

    if ($hits.Count -gt 0) {
        throw "Potential key material found in active delivery config files: $($hits -join '; ')"
    }
}

function Test-BlankOrTemplateSecret($Value) {
    if ($null -eq $Value) {
        return $true
    }
    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $true
    }
    return $text.Trim() -match '^\$\{[A-Z0-9_]+\}$'
}

function Test-NoActiveDeliverySecrets([string]$OutRoot) {
    $hits = New-Object System.Collections.Generic.List[string]
    $openclawConfig = Join-Path $OutRoot "resources\data\.openclaw\openclaw.json"
    if (Test-Path -LiteralPath $openclawConfig) {
        $cfg = Get-Content -LiteralPath $openclawConfig -Raw | ConvertFrom-Json
        if ($null -ne $cfg.models -and $null -ne $cfg.models.providers) {
            foreach ($providerProperty in $cfg.models.providers.PSObject.Properties) {
                $provider = $providerProperty.Value
                if ($null -ne $provider -and $provider.PSObject.Properties.Name -contains "apiKey") {
                    if (-not (Test-BlankOrTemplateSecret $provider.apiKey)) {
                        $hits.Add("resources\data\.openclaw\openclaw.json models.providers.$($providerProperty.Name).apiKey")
                    }
                }
            }
        }
        if ($null -ne $cfg.gateway -and $null -ne $cfg.gateway.auth) {
            if ($cfg.gateway.auth.PSObject.Properties.Name -contains "token" -and -not (Test-BlankOrTemplateSecret $cfg.gateway.auth.token)) {
                $hits.Add("resources\data\.openclaw\openclaw.json gateway.auth.token")
            }
            if ($cfg.gateway.auth.PSObject.Properties.Name -contains "password" -and -not (Test-BlankOrTemplateSecret $cfg.gateway.auth.password)) {
                $hits.Add("resources\data\.openclaw\openclaw.json gateway.auth.password")
            }
        }
    }

    foreach ($relative in @("resources\data\.openclaw\clawpanel.json", "resources\data\clawpanel.json")) {
        $path = Join-Path $OutRoot $relative
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }
        $cfg = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if ($cfg.PSObject.Properties.Name -contains "accessPassword" -and -not (Test-BlankOrTemplateSecret $cfg.accessPassword)) {
            $hits.Add("$relative accessPassword")
        }
    }

    if ($hits.Count -gt 0) {
        throw "Active delivery secrets must be blank or templated: $($hits -join '; ')"
    }
}

function Clear-PanelDeliverySecrets([string]$ResourcesRoot) {
    $paths = @(
        (Join-Path $ResourcesRoot "data\.openclaw\clawpanel.json"),
        (Join-Path $ResourcesRoot "data\clawpanel.json")
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    foreach ($path in $paths) {
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }
        $cfg = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if (-not ($cfg.PSObject.Properties.Name -contains "accessPassword")) {
            $cfg | Add-Member -NotePropertyName "accessPassword" -NotePropertyValue ""
        } else {
            $cfg.accessPassword = ""
        }
        if ($cfg.PSObject.Properties.Name -contains "mustChangePassword") {
            $cfg.PSObject.Properties.Remove("mustChangePassword")
        }
        if (-not ($cfg.PSObject.Properties.Name -contains "ignoreRisk")) {
            $cfg | Add-Member -NotePropertyName "ignoreRisk" -NotePropertyValue $true
        } else {
            $cfg.ignoreRisk = $true
        }
        $json = $cfg | ConvertTo-Json -Depth 80
        [System.IO.File]::WriteAllText($path, $json + [Environment]::NewLine, $utf8NoBom)
    }
}

function Clean-OpenClawData([string]$OpenClawData) {
    if (-not (Test-Path -LiteralPath $OpenClawData)) {
        throw "Missing OpenClaw data directory: $OpenClawData"
    }

    foreach ($name in @("agents", "canvas", "devices", "identity", "logs", "memory", "tasks", "workspace")) {
        Reset-Directory (Join-Path $OpenClawData $name)
    }
    Remove-IfExists (Join-Path $OpenClawData ".openclaw")
    Remove-IfExists (Join-Path $OpenClawData "backups")

    foreach ($name in @("clawpanel-device-key.json", "gateway-owner.json", "update-check.json")) {
        Remove-IfExists (Join-Path $OpenClawData $name)
    }
    Get-ChildItem -LiteralPath $OpenClawData -Force -File -Filter "openclaw.json.bak*" -ErrorAction SilentlyContinue | Remove-Item -Force
    Get-ChildItem -LiteralPath $OpenClawData -Force -File -Filter "openclaw.json.rejected.*" -ErrorAction SilentlyContinue | Remove-Item -Force
    Remove-IfExists (Join-Path $OpenClawData "openclaw.json.last-good")

    $configPath = Join-Path $OpenClawData "openclaw.json"
    if (Test-Path -LiteralPath $configPath) {
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($null -ne $node) {
            $script = @'
const fs = require("fs");
const configPath = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

function clearLiteralSecret(target, key) {
  if (!target || typeof target !== "object" || Array.isArray(target) || !Object.prototype.hasOwnProperty.call(target, key)) return;
  const value = target[key];
  if (typeof value !== "string") {
    if (value != null) target[key] = "";
    return;
  }
  const text = value.trim();
  if (!text) return;
  target[key] = "";
}

function mergeObjects(previous, next) {
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) return next;
  if (!next || typeof next !== "object" || Array.isArray(next)) return next;
  const out = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    out[key] = mergeObjects(previous[key], value);
  }
  return out;
}

if (cfg.agents && typeof cfg.agents === "object" && !Array.isArray(cfg.agents)) {
  cfg.agents.defaults = {};
}
if (cfg.models && cfg.models.providers && typeof cfg.models.providers === "object" && !Array.isArray(cfg.models.providers)) {
  const normalized = {};
  for (const [key, provider] of Object.entries(cfg.models.providers)) {
    const normalizedKey = String(key).toLowerCase();
    normalized[normalizedKey] = normalized[normalizedKey] ? mergeObjects(normalized[normalizedKey], provider) : provider;
    if (normalized[normalizedKey] && typeof normalized[normalizedKey] === "object" && !Array.isArray(normalized[normalizedKey])) {
      delete normalized[normalizedKey].managed;
      clearLiteralSecret(normalized[normalizedKey], "apiKey");
    }
  }
  cfg.models.providers = normalized;
}
if (cfg.models?.primary?.provider) cfg.models.primary.provider = String(cfg.models.primary.provider).toLowerCase();
if (cfg.models?.default?.provider) cfg.models.default.provider = String(cfg.models.default.provider).toLowerCase();
if (cfg.gateway?.auth && typeof cfg.gateway.auth === "object" && !Array.isArray(cfg.gateway.auth)) {
  clearLiteralSecret(cfg.gateway.auth, "token");
  clearLiteralSecret(cfg.gateway.auth, "password");
}

fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
'@
            $scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) ("superclaw-clean-openclaw-" + [guid]::NewGuid().ToString("N") + ".cjs")
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($scriptPath, $script, $utf8NoBom)
            try {
                & $node.Source $scriptPath $configPath
                if ($LASTEXITCODE -ne 0) {
                    throw "Failed to normalize OpenClaw config for delivery"
                }
            } finally {
                Remove-Item -LiteralPath $scriptPath -Force -ErrorAction SilentlyContinue
            }
        } else {
            $cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
            if ($null -ne $cfg.agents) {
                $cfg.agents.defaults = [pscustomobject]@{}
            }
            if ($null -ne $cfg.models -and $null -ne $cfg.models.providers) {
                foreach ($providerProperty in $cfg.models.providers.PSObject.Properties) {
                    $provider = $providerProperty.Value
                    if ($null -ne $provider -and $provider.PSObject.Properties.Name -contains "apiKey") {
                        $provider.apiKey = ""
                    }
                }
            }
            if ($null -ne $cfg.gateway -and $null -ne $cfg.gateway.auth) {
                if ($cfg.gateway.auth.PSObject.Properties.Name -contains "token") {
                    $cfg.gateway.auth.token = ""
                }
                if ($cfg.gateway.auth.PSObject.Properties.Name -contains "password") {
                    $cfg.gateway.auth.password = ""
                }
            }
            $json = $cfg | ConvertTo-Json -Depth 80
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($configPath, $json + [Environment]::NewLine, $utf8NoBom)
        }
    }
}

function Clean-PortableRuntimeResidue([string]$ResourcesRoot) {
    Remove-IfExists (Join-Path $ResourcesRoot "uv-tools\.lock")
    foreach ($pattern in @("*.pid", "*.lock", "*.log", "*.rejected.*")) {
        Get-ChildItem -LiteralPath $ResourcesRoot -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
            ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
    }
}

function Test-NoRuntimeResidue([string]$OutRoot) {
    $hits = New-Object System.Collections.Generic.List[string]
    $knownResidue = @(
        "resources\data\hermes\gateway.lock",
        "resources\data\hermes\gateway.pid",
        "resources\data\hermes\gateway-run.log",
        "resources\data\hermes\auth.lock",
        "resources\data\hermes\.update_check",
        "resources\data\hermes\tmp_healthcheck.txt",
        "resources\uv-tools\.lock",
        "resources\data\.openclaw\clawpanel-device-key.json",
        "resources\data\.openclaw\gateway-owner.json",
        "resources\data\.openclaw\update-check.json"
    )

    foreach ($relative in $knownResidue) {
        $path = Join-Path $OutRoot $relative
        if (Test-Path -LiteralPath $path) {
            $hits.Add($relative)
        }
    }

    foreach ($relativeDir in @("resources\data\hermes\logs", "resources\data\.openclaw\logs")) {
        $dir = Join-Path $OutRoot $relativeDir
        if (-not (Test-Path -LiteralPath $dir)) {
            continue
        }
        Get-ChildItem -LiteralPath $dir -Force -File -ErrorAction SilentlyContinue |
            ForEach-Object { $hits.Add($_.FullName.Substring($OutRoot.Length).TrimStart('\', '/')) }
    }

    if ($hits.Count -gt 0) {
        throw "Runtime residue found: $($hits -join '; ')"
    }
}

function Test-NoStalePaths([string]$OutRoot) {
    $critical = @(
        "resources\uv-python\python\Lib\site-packages\hermes-agent.pth",
        "resources\uv-tools\hermes-agent\pyvenv.cfg",
        "resources\uv-tools\hermes-agent\uv-receipt.toml",
        "resources\uv-tools\hermes-agent\Lib\site-packages\hermes_agent-0.14.0.dist-info\direct_url.json",
        "resources\uv-tools\hermes-agent\Lib\site-packages\hermes_cli\banner.py",
        "resources\runtime\openclaw\openclaw.cmd",
        "resources\data\hermes\config.yaml",
        "resources\data\.openclaw\openclaw.json",
        "resources\data\.openclaw\clawpanel.json"
    )
    $needles = @("C:\Users\ZXKJ", "C:/Users/ZXKJ", "Users\ZXKJ", "Users/ZXKJ", "ZXKJ", $ROOT, $env:USERPROFILE, ($env:USERPROFILE -replace "\\", "/"))
    $hits = New-Object System.Collections.Generic.List[string]

    foreach ($relative in $critical) {
        $path = Join-Path $OutRoot $relative
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }
        $text = [System.IO.File]::ReadAllText($path)
        foreach ($needle in $needles) {
            if ($text.Contains($needle)) {
                $hits.Add("$relative contains $needle")
            }
        }
    }

    if ($hits.Count -gt 0) {
        throw "Stale path residue found: $($hits -join '; ')"
    }
}

function Test-Launchers([string]$OutRoot) {
    $resources = Join-Path $OutRoot "resources"
    $openclawCmd = Join-Path $resources "runtime\openclaw\openclaw.cmd"
    $hermesExe = Join-Path $resources "uv-tools\bin\hermes.exe"
    $hermesHome = Join-Path $resources "data\hermes"
    $claudeExe = Join-Path $resources "runtime\claude-code\bin\claude.exe"
    $claudeHome = Join-Path $resources "data\claude-code\home"
    $claudeProjects = Join-Path $resources "data\claude-code\projects"

    $oldPath = $env:PATH
    $oldHermesHome = $env:HERMES_HOME
    $oldHermesDisableUpdateCheck = $env:HERMES_DISABLE_UPDATE_CHECK
    $oldHome = $env:HOME
    $oldUserProfile = $env:USERPROFILE
    $oldAppData = $env:APPDATA
    $oldLocalAppData = $env:LOCALAPPDATA
    $oldClaudeConfigDir = $env:CLAUDE_CONFIG_DIR
    $oldClaudeProjectsDir = $env:CLAUDE_CODE_PROJECTS_DIR
    $oldClaudeDisableTraffic = $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    try {
        New-Item -ItemType Directory -Path $claudeHome -Force | Out-Null
        New-Item -ItemType Directory -Path $claudeProjects -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $claudeHome "AppData\Roaming") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $claudeHome "AppData\Local") -Force | Out-Null

        $env:PATH = @(
            (Join-Path $resources "uv-tools\bin"),
            (Join-Path $resources "uv-tools\hermes-agent\Scripts"),
            (Join-Path $resources "bin"),
            (Join-Path $resources "uv-python\python"),
            (Join-Path $resources "runtime\openclaw"),
            (Join-Path $env:SystemRoot "System32"),
            $env:SystemRoot
        ) -join [System.IO.Path]::PathSeparator
        $env:HERMES_HOME = $hermesHome
        $env:HERMES_DISABLE_UPDATE_CHECK = "1"
        $env:HOME = $claudeHome
        $env:USERPROFILE = $claudeHome
        $env:APPDATA = Join-Path $claudeHome "AppData\Roaming"
        $env:LOCALAPPDATA = Join-Path $claudeHome "AppData\Local"
        $env:CLAUDE_CONFIG_DIR = Join-Path $claudeHome "claude-config"
        $env:CLAUDE_CODE_PROJECTS_DIR = $claudeProjects
        $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"

        $openclawOut = & cmd.exe /d /s /c "`"$openclawCmd`" --version" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "OpenClaw portable launcher failed: $openclawOut"
        }

        Push-Location (Split-Path -Parent $hermesExe)
        try {
            $hermesOut = & $hermesExe version 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "Hermes portable launcher failed: $hermesOut"
            }
            if (($hermesOut -join "`n") -match "Update available") {
                throw "Hermes update check is still active"
            }
        } finally {
            Pop-Location
        }

        $claudeOut = & $claudeExe --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Claude Code portable CLI failed: $claudeOut"
        }

        return @{
            OpenClaw = ($openclawOut | Select-Object -First 1)
            Hermes = ($hermesOut | Select-Object -First 1)
            ClaudeCode = ($claudeOut | Select-Object -First 1)
        }
    } finally {
        $env:PATH = $oldPath
        if ($null -eq $oldHermesHome) {
            Remove-Item Env:\HERMES_HOME -ErrorAction SilentlyContinue
        } else {
            $env:HERMES_HOME = $oldHermesHome
        }
        if ($null -eq $oldHermesDisableUpdateCheck) {
            Remove-Item Env:\HERMES_DISABLE_UPDATE_CHECK -ErrorAction SilentlyContinue
        } else {
            $env:HERMES_DISABLE_UPDATE_CHECK = $oldHermesDisableUpdateCheck
        }
        if ($null -eq $oldHome) { Remove-Item Env:\HOME -ErrorAction SilentlyContinue } else { $env:HOME = $oldHome }
        if ($null -eq $oldUserProfile) { Remove-Item Env:\USERPROFILE -ErrorAction SilentlyContinue } else { $env:USERPROFILE = $oldUserProfile }
        if ($null -eq $oldAppData) { Remove-Item Env:\APPDATA -ErrorAction SilentlyContinue } else { $env:APPDATA = $oldAppData }
        if ($null -eq $oldLocalAppData) { Remove-Item Env:\LOCALAPPDATA -ErrorAction SilentlyContinue } else { $env:LOCALAPPDATA = $oldLocalAppData }
        if ($null -eq $oldClaudeConfigDir) { Remove-Item Env:\CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue } else { $env:CLAUDE_CONFIG_DIR = $oldClaudeConfigDir }
        if ($null -eq $oldClaudeProjectsDir) { Remove-Item Env:\CLAUDE_CODE_PROJECTS_DIR -ErrorAction SilentlyContinue } else { $env:CLAUDE_CODE_PROJECTS_DIR = $oldClaudeProjectsDir }
        if ($null -eq $oldClaudeDisableTraffic) { Remove-Item Env:\CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC -ErrorAction SilentlyContinue } else { $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = $oldClaudeDisableTraffic }
    }
}

function Test-PortableGit([string]$OutRoot) {
    $resources = Join-Path $OutRoot "resources"
    $gitRoot = Join-Path $resources "portable\git"
    $bash = Join-Path $gitRoot "usr\bin\bash.exe"
    $gitExe = Join-Path $gitRoot "cmd\git.exe"
    $required = @(
        $bash,
        $gitExe,
        (Join-Path $gitRoot "usr\bin\cygpath.exe"),
        (Join-Path $gitRoot "mingw64"),
        (Join-Path $gitRoot "dev"),
        (Join-Path $gitRoot "tmp"),
        (Join-Path $gitRoot "etc\profile")
    )
    $missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missing.Count -gt 0) {
        throw "Portable Git incomplete: $($missing -join '; ')"
    }

    $oldPath = $env:PATH
    $oldHermesGitBashPath = $env:HERMES_GIT_BASH_PATH
    try {
        $env:PATH = @(
            (Join-Path $gitRoot "bin"),
            (Join-Path $gitRoot "cmd"),
            (Join-Path $gitRoot "usr\bin"),
            (Join-Path $env:SystemRoot "System32"),
            $env:SystemRoot
        ) -join [System.IO.Path]::PathSeparator
        $env:HERMES_GIT_BASH_PATH = $bash
        $gitVersion = & $gitExe --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Portable Git executable failed: $gitVersion"
        }
        return ($gitVersion | Select-Object -First 1)
    } finally {
        $env:PATH = $oldPath
        if ($null -eq $oldHermesGitBashPath) {
            Remove-Item Env:\HERMES_GIT_BASH_PATH -ErrorAction SilentlyContinue
        } else {
            $env:HERMES_GIT_BASH_PATH = $oldHermesGitBashPath
        }
    }
}

Write-Host "Preparing USB release from: $SRC"
Write-Host "Output: $OUT"

if (-not (Test-Path -LiteralPath (Join-Path $SRC "superclaw.exe"))) {
    throw "Missing release executable. Build release first."
}
if (-not (Test-Path -LiteralPath (Join-Path $SRC "resources"))) {
    throw "Missing release resources directory."
}

Assert-ChildPath -Parent $ROOT -Child $OUT
Remove-SafeDirectory $OUT
New-Item -ItemType Directory -Path $OUT -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $SRC "superclaw.exe") -Destination (Join-Path $OUT "superclaw.exe") -Force
Copy-Mirror -From (Join-Path $SRC "resources") -To (Join-Path $OUT "resources")

$resourcesOut = Join-Path $OUT "resources"
$hermesData = Join-Path $resourcesOut "data\hermes"
$openclawData = Join-Path $resourcesOut "data\.openclaw"

$skillCount = Ensure-HermesSkills (Join-Path $hermesData "skills")
Clean-HermesInstallMetadata $resourcesOut
Clean-HermesData $hermesData
Clean-OpenClawData $openclawData
Clear-PanelDeliverySecrets $resourcesOut
Clean-PortableRuntimeResidue $resourcesOut
Remove-ForbiddenDeliveryFiles $OUT
Test-NoForbiddenDeliveryFiles $OUT
Test-NoStalePaths $OUT
Test-NoKeyLeaks $OUT
Test-NoActiveDeliverySecrets $OUT
$portableGitVersion = Test-PortableGit $OUT
$launcherVersions = Test-Launchers $OUT
Clean-HermesInstallMetadata $resourcesOut
Clean-HermesData $hermesData
Clean-OpenClawData $openclawData
Clear-PanelDeliverySecrets $resourcesOut
Clean-PortableRuntimeResidue $resourcesOut
Remove-ForbiddenDeliveryFiles $OUT
Test-NoForbiddenDeliveryFiles $OUT
Test-NoStalePaths $OUT
Test-NoKeyLeaks $OUT
Test-NoActiveDeliverySecrets $OUT
Test-NoRuntimeResidue $OUT

$categoryCount = @(Get-ChildItem -LiteralPath (Join-Path $hermesData "skills") -Directory -ErrorAction SilentlyContinue | Where-Object { -not $_.Name.StartsWith(".") }).Count
$exeSizeMb = [math]::Round((Get-Item -LiteralPath (Join-Path $OUT "superclaw.exe")).Length / 1MB, 2)

Write-Host ""
Write-Host "USB release is ready."
Write-Host "Output: $OUT"
Write-Host "superclaw.exe: $exeSizeMb MB"
Write-Host "Hermes skills: $skillCount SKILL.md files in $categoryCount categories"
Write-Host "OpenClaw: $($launcherVersions.OpenClaw)"
Write-Host "Hermes: $($launcherVersions.Hermes)"
Write-Host "Claude Code: $($launcherVersions.ClaudeCode)"
Write-Host "Portable Git: $portableGitVersion"
