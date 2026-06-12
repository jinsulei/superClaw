from __future__ import annotations

import json
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any


TOOLSET = "desktop_control"


APP_QUERY_ALIASES: list[tuple[tuple[str, ...], str]] = [
    (("douyin", "tiktok"), "\u6296\u97f3"),
    (("kuaishou",), "\u5feb\u624b"),
    (("xiaohongshu", "rednote"), "\u5c0f\u7ea2\u4e66"),
    (("feishu", "lark"), "\u98de\u4e66"),
    (("dingtalk", "dingding"), "\u9489\u9489"),
    (("wechat", "weixin"), "\u5fae\u4fe1"),
]


DESKTOP_CONTROL_SCHEMA = {
    "name": "desktop_control",
    "description": (
        "Control already-open Windows desktop applications through the bundled "
        "portable SuperClaw sidecar. Use only when the user explicitly asks to "
        "operate a desktop app such as Douyin, Feishu, DingTalk, QQ, or another "
        "already-open local app. Start with action=list_windows when the window "
        "title is unclear. Do not use for normal chat, tables, copywriting, or "
        "browser-only tasks."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["status", "list_windows", "activate", "click", "type_text", "press_key", "screenshot"],
                "description": "Desktop operation to run.",
            },
            "query": {
                "type": "string",
                "description": "Window title substring. Alias of title.",
            },
            "title": {
                "type": "string",
                "description": "Window title substring for activate/click/type_text/press_key.",
            },
            "text": {
                "type": "string",
                "description": "Text to type for type_text.",
            },
            "key": {
                "type": "string",
                "description": "Key name for press_key, such as enter, tab, escape, ctrl+l.",
            },
            "x": {
                "type": "integer",
                "description": "Optional screen X coordinate for click.",
            },
            "y": {
                "type": "integer",
                "description": "Optional screen Y coordinate for click.",
            },
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 50,
                "description": "Maximum number of windows returned by list_windows.",
            },
            "output_path": {
                "type": "string",
                "description": "Optional full PNG output path for screenshots.",
            },
            "output_dir": {
                "type": "string",
                "description": "Optional output directory for screenshots.",
            },
            "max_width": {
                "type": "integer",
                "minimum": 320,
                "description": "Optional max screenshot width. Default 1280.",
            },
            "max_height": {
                "type": "integer",
                "minimum": 240,
                "description": "Optional max screenshot height. Default 900.",
            },
        },
        "required": ["action"],
        "additionalProperties": False,
    },
}


def _json(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _agent_candidates() -> list[Path]:
    here = Path(__file__).resolve()
    candidates: list[Path] = []
    for parent in [here.parent, *here.parents]:
        candidates.extend(
            [
                parent / "resources" / "bin" / "desktop-control-agent.exe",
                parent / "bin" / "desktop-control-agent.exe",
            ]
        )
    return candidates


def _agent_path() -> Path | None:
    for candidate in _agent_candidates():
        if candidate.is_file():
            return candidate
    return None


def _safe_stamp() -> str:
    return datetime.now().isoformat(timespec="milliseconds").replace(":", "-").replace(".", "-")


def _query_candidates(args: dict[str, Any]) -> list[str]:
    raw = str(args.get("query") or args.get("title") or "").strip()
    if not raw:
        return [""]
    values = [raw]
    lowered = raw.lower()
    for tokens, alias in APP_QUERY_ALIASES:
        if any(token in lowered for token in tokens) and alias not in values:
            values.append(alias)
    return values


def _is_window_not_found(result_text: str) -> bool:
    try:
        result = json.loads(result_text)
    except Exception:
        return False
    return "window not found" in str(result.get("message") or "").lower()


def _run_window_screenshot_once(args: dict[str, Any]) -> str:
    query = str(args.get("query") or args.get("title") or "").strip()
    out_dir = Path(str(args.get("output_dir") or (Path.home() / ".hermes" / "media" / "desktop")))
    out_path = Path(str(args.get("output_path") or (out_dir / f"desktop-{_safe_stamp()}.png")))
    max_width = int(args.get("max_width") or 1280)
    max_height = int(args.get("max_height") or 900)
    script = r'''
param(
  [string]$Query,
  [string]$OutPath,
  [int]$MaxWidth = 1280,
  [int]$MaxHeight = 900
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$signature = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SuperClawWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
Add-Type $signature
$script:target = [IntPtr]::Zero
$script:title = ""
$needle = if ($Query) { $Query.ToLowerInvariant() } else { "" }
$callback = [SuperClawWin32+EnumWindowsProc]{
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if (-not [SuperClawWin32]::IsWindowVisible($hWnd)) { return $true }
  $sb = New-Object System.Text.StringBuilder 512
  [void][SuperClawWin32]::GetWindowText($hWnd, $sb, $sb.Capacity)
  $title = $sb.ToString()
  if ($title -and (($needle -eq "") -or ($title.ToLowerInvariant().Contains($needle)))) {
    $script:target = $hWnd
    $script:title = $title
    return $false
  }
  return $true
}
[void][SuperClawWin32]::EnumWindows($callback, [IntPtr]::Zero)
if ($script:target -eq [IntPtr]::Zero) {
  @{ ok = $false; message = "window not found"; data = @{ query = $Query } } | ConvertTo-Json -Depth 6 -Compress
  exit 0
}
$rect = New-Object SuperClawWin32+RECT
if (-not [SuperClawWin32]::GetWindowRect($script:target, [ref]$rect)) {
  @{ ok = $false; message = "GetWindowRect failed"; data = @{ query = $Query; title = $script:title } } | ConvertTo-Json -Depth 6 -Compress
  exit 0
}
$width = [Math]::Max(1, $rect.Right - $rect.Left)
$height = [Math]::Max(1, $rect.Bottom - $rect.Top)
$dir = Split-Path -Parent $OutPath
if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp = New-Object System.Drawing.Bitmap $width, $height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$method = "print_window"
try {
  $hdc = $gfx.GetHdc()
  try { $printed = [SuperClawWin32]::PrintWindow($script:target, $hdc, 2) }
  finally { $gfx.ReleaseHdc($hdc) }
  if (-not $printed) {
    $method = "copy_from_screen"
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
  }
  $savedWidth = $width
  $savedHeight = $height
  $saveBmp = $bmp
  $scale = [Math]::Min($MaxWidth / [double]$width, $MaxHeight / [double]$height)
  if ($scale -lt 1) {
    $savedWidth = [Math]::Max(1, [int][Math]::Round($width * $scale))
    $savedHeight = [Math]::Max(1, [int][Math]::Round($height * $scale))
    $resized = New-Object System.Drawing.Bitmap $savedWidth, $savedHeight
    $rgfx = [System.Drawing.Graphics]::FromImage($resized)
    try {
      $rgfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $rgfx.DrawImage($bmp, 0, 0, $savedWidth, $savedHeight)
    } finally { $rgfx.Dispose() }
    $saveBmp = $resized
  }
  try { $saveBmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png) }
  finally { if ($saveBmp -ne $bmp) { $saveBmp.Dispose() } }
} finally {
  $gfx.Dispose()
  $bmp.Dispose()
}
@{
  ok = $true
  message = "screenshot saved"
  data = @{
    path = $OutPath
    title = $script:title
    width = $width
    height = $height
    saved_width = $savedWidth
    saved_height = $savedHeight
    method = $method
    rect = @{ left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom }
  }
} | ConvertTo-Json -Depth 6 -Compress
'''
    ps1 = Path(tempfile.gettempdir()) / f"superclaw-hermes-screenshot-{_safe_stamp()}.ps1"
    ps1.write_text(script, encoding="utf-8")
    try:
        proc = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ps1),
                "-Query",
                query,
                "-OutPath",
                str(out_path),
                "-MaxWidth",
                str(max_width),
                "-MaxHeight",
                str(max_height),
            ],
            text=True,
            encoding="utf-8",
            capture_output=True,
            timeout=20,
            check=False,
        )
    except Exception as exc:
        return _json({"ok": False, "message": f"screenshot failed: {exc}", "data": {"query": query}})
    finally:
        try:
            ps1.unlink(missing_ok=True)
        except Exception:
            pass
    text = (proc.stdout or "").strip()
    if not text:
        return _json({"ok": False, "message": (proc.stderr or "screenshot returned no output").strip(), "exit_code": proc.returncode})
    try:
        return _json(json.loads(text))
    except Exception:
        return _json({"ok": False, "message": "screenshot returned invalid json", "stdout": text[:4000], "stderr": (proc.stderr or "")[:4000]})


def _run_window_screenshot(args: dict[str, Any]) -> str:
    last = ""
    for query in _query_candidates(args):
        payload = dict(args)
        if query:
            payload["query"] = query
        payload.pop("title", None)
        last = _run_window_screenshot_once(payload)
        try:
            result = json.loads(last)
        except Exception:
            return last
        if result.get("ok") or not _is_window_not_found(last):
            return _json(result)
    return last or _json({"ok": False, "message": "window not found"})


def _run_agent_once(exe: Path, payload: dict[str, Any]) -> str:
    try:
        proc = subprocess.run(
            [str(exe)],
            input=json.dumps(payload, ensure_ascii=False),
            text=True,
            encoding="utf-8",
            capture_output=True,
            timeout=20,
            check=False,
        )
    except Exception as exc:
        return _json({"ok": False, "message": f"desktop_control failed: {exc}"})

    text = (proc.stdout or "").strip()
    if not text:
        return _json(
            {
                "ok": False,
                "message": (proc.stderr or "desktop-control-agent returned no output").strip(),
                "exit_code": proc.returncode,
            }
        )
    try:
        return _json(json.loads(text))
    except Exception:
        return _json(
            {
                "ok": False,
                "message": "desktop-control-agent returned invalid json",
                "exit_code": proc.returncode,
                "stdout": text[:4000],
                "stderr": (proc.stderr or "")[:4000],
            }
        )


def _run_agent_with_fallback(exe: Path, args: dict[str, Any]) -> str:
    last = ""
    for query in _query_candidates(args):
        payload = dict(args)
        if query:
            payload["query"] = query
        payload.pop("title", None)
        last = _run_agent_once(exe, payload)
        try:
            result = json.loads(last)
        except Exception:
            return last
        if result.get("ok") or not _is_window_not_found(last):
            return _json(result)
    return last or _json({"ok": False, "message": "window not found"})


def _handle_desktop_control(args: dict[str, Any] | None = None, **_: Any) -> str:
    args = args or {}
    if args.get("action") == "screenshot":
        return _run_window_screenshot(args)

    exe = _agent_path()
    if not exe:
        return _json(
            {
                "ok": False,
                "message": "desktop-control-agent.exe not found in bundled resources.",
                "searched": [str(p) for p in _agent_candidates()[:8]],
            }
        )

    return _run_agent_with_fallback(exe, args)


def register(ctx) -> None:
    ctx.register_tool(
        name="desktop_control",
        toolset=TOOLSET,
        schema=DESKTOP_CONTROL_SCHEMA,
        handler=_handle_desktop_control,
        description="Control already-open Windows desktop applications through the portable SuperClaw sidecar.",
        emoji="D",
    )
