from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


TOOLSET = "desktop_control"


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
                "enum": ["status", "list_windows", "activate", "click", "type_text", "press_key"],
                "description": "Desktop operation to run.",
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


def _handle_desktop_control(args: dict[str, Any] | None = None, **_: Any) -> str:
    args = args or {}
    exe = _agent_path()
    if not exe:
        return _json(
            {
                "ok": False,
                "message": "desktop-control-agent.exe not found in bundled resources.",
                "searched": [str(p) for p in _agent_candidates()[:8]],
            }
        )

    payload = dict(args)
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


def register(ctx) -> None:
    ctx.register_tool(
        name="desktop_control",
        toolset=TOOLSET,
        schema=DESKTOP_CONTROL_SCHEMA,
        handler=_handle_desktop_control,
        description="Control already-open Windows desktop applications through the portable SuperClaw sidecar.",
        emoji="D",
    )
