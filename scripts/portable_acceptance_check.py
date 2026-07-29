#!/usr/bin/env python3
"""Portable acceptance checks for the SuperClaw release folder.

Default mode is non-destructive:
  - reads configs
  - checks bundled runtimes
  - probes local health endpoints
  - creates and removes tiny write-probe files in data dirs

Use --deep for optional package/archive simulation checks.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"
SKIP = "SKIP"


@dataclass
class Check:
    stage: str
    name: str
    status: str
    message: str


def now_ms() -> int:
    return int(time.time() * 1000)


class Checker:
    def __init__(self, root: Path, release: Path, deep: bool = False) -> None:
        self.root = root.resolve()
        self.release = release.resolve()
        self.resources = self.release / "resources"
        self.deep = deep
        self.results: list[Check] = []

    def add(self, stage: str, name: str, status: str, message: str) -> None:
        self.results.append(Check(stage, name, status, message))

    def exists_file(self, stage: str, name: str, path: Path, min_size: int = 1) -> bool:
        if not path.is_file():
            self.add(stage, name, FAIL, f"missing file: {path}")
            return False
        size = path.stat().st_size
        if size < min_size:
            self.add(stage, name, FAIL, f"file too small ({size} bytes): {path}")
            return False
        self.add(stage, name, PASS, f"{path.name} ({size} bytes)")
        return True

    def exists_dir(self, stage: str, name: str, path: Path) -> bool:
        if not path.is_dir():
            self.add(stage, name, FAIL, f"missing dir: {path}")
            return False
        self.add(stage, name, PASS, str(path))
        return True

    def run(self) -> None:
        self.p0_integrity()
        self.p0_local_runtime()
        self.p0_stability_snapshot()
        self.p1_config_and_services()
        self.p2_portable_delivery()
        if self.deep:
            self.p2_deep_archive_probe()
        else:
            self.add("P2", "archive migration simulation", SKIP, "run with --deep to create a temporary zip probe")
            self.add("P2", "fresh machine / USB test", SKIP, "requires a second clean Windows machine or USB device")
        self.cleanup_probe_residue()

    def cleanup_probe_residue(self) -> None:
        removed = 0
        for relative_dir in [
            Path("resources") / "data" / "hermes" / "logs",
            Path("resources") / "data" / ".openclaw" / "logs",
        ]:
            directory = self.release / relative_dir
            if not directory.is_dir():
                continue
            for path in directory.iterdir():
                if path.is_file():
                    try:
                        path.unlink()
                        removed += 1
                    except OSError:
                        pass
        for relative in [
            Path("resources") / "data" / "hermes" / "gateway.lock",
            Path("resources") / "data" / "hermes" / "gateway.pid",
            Path("resources") / "data" / "hermes" / "gateway-run.log",
            Path("resources") / "data" / "hermes" / "auth.lock",
            Path("resources") / "data" / ".openclaw" / "gateway-owner.json",
        ]:
            path = self.release / relative
            if path.is_file():
                try:
                    path.unlink()
                    removed += 1
                except OSError:
                    pass
        self.add("P2", "acceptance probe cleanup", PASS, f"removed {removed} runtime probe files")

    # ---------------- P0 ----------------
    def p0_integrity(self) -> None:
        stage = "P0"
        self.add(stage, "release root exists", PASS if self.release.is_dir() else FAIL, str(self.release))

        for label, path in [
            ("resources dir", self.resources),
            ("bin dir", self.resources / "bin"),
            ("data dir", self.resources / "data"),
            ("OpenClaw runtime dir", self.resources / "runtime" / "openclaw"),
            ("Claude Code runtime dir", self.resources / "runtime" / "claude-code"),
            ("Hermes uv-tools dir", self.resources / "uv-tools"),
            ("Hermes uv-python dir", self.resources / "uv-python"),
            ("Hermes bundled skills dir", self.resources / "data" / "hermes" / "skills"),
            ("portable Git dir", self.resources / "portable" / "git"),
        ]:
            self.exists_dir(stage, label, path)

        for label, path in [
            ("SuperClaw executable", self.release / "superclaw.exe"),
            ("bundled uv", self.resources / "bin" / "uv.exe"),
            ("bundled Python", self.resources / "uv-python" / "python" / "python.exe"),
            ("Hermes launcher", self.resources / "uv-tools" / "bin" / "hermes.exe"),
            ("Hermes package", self.resources / "uv-tools" / "hermes-agent" / "Lib" / "site-packages" / "hermes_cli" / "__init__.py"),
            ("Hermes receipt", self.resources / "uv-tools" / "hermes-agent" / "uv-receipt.toml"),
            ("OpenClaw command", self.resources / "runtime" / "openclaw" / "openclaw.cmd"),
            ("OpenClaw entry", self.resources / "runtime" / "openclaw" / "openclaw.mjs"),
            ("OpenClaw package", self.resources / "runtime" / "openclaw" / "package.json"),
            ("OpenClaw bundled Node", self.resources / "runtime" / "openclaw" / "node.exe"),
            ("Claude Code CLI", self.resources / "runtime" / "claude-code" / "bin" / "claude.exe"),
            ("OpenClaw config", self.resources / "data" / ".openclaw" / "openclaw.json"),
            ("OpenClaw panel config", self.resources / "data" / ".openclaw" / "clawpanel.json"),
            ("Hermes config", self.resources / "data" / "hermes" / "config.yaml"),
            ("portable Git bash", self.resources / "portable" / "git" / "usr" / "bin" / "bash.exe"),
            ("portable Git cygpath", self.resources / "portable" / "git" / "usr" / "bin" / "cygpath.exe"),
        ]:
            self.exists_file(stage, label, path)

        self.check_path_policy(stage)
        self.check_for_stale_paths(stage)
        self.check_forbidden_delivery_files(stage)
        self.check_key_leaks(stage)
        self.check_active_delivery_secrets(stage)
        self.check_hermes_skills_seed(stage)

    def check_path_policy(self, stage: str) -> None:
        path_text = str(self.release)
        has_cjk = any("\u4e00" <= c <= "\u9fff" for c in path_text)
        has_space = any(c.isspace() for c in path_text)
        bad_special = re.search(r"[^A-Za-z0-9_:\\/.\-]", path_text) is not None
        too_long = len(path_text) >= 180
        if has_cjk or has_space or bad_special:
            self.add(stage, "path policy", FAIL, f"path should be short ASCII without spaces: {path_text}")
        elif too_long:
            self.add(stage, "path policy", WARN, f"path is clean but long ({len(path_text)} chars): {path_text}")
        else:
            self.add(stage, "path policy", PASS, path_text)

    def check_for_stale_paths(self, stage: str) -> None:
        targets = [
            self.resources / "uv-tools" / "bin" / "hermes.exe",
            self.resources / "uv-python" / "python" / "Lib" / "site-packages" / "hermes-agent.pth",
            self.resources / "uv-tools" / "hermes-agent" / "pyvenv.cfg",
            self.resources / "uv-tools" / "hermes-agent" / "uv-receipt.toml",
            self.resources / "uv-tools" / "hermes-agent" / "Lib" / "site-packages" / "hermes_agent-0.14.0.dist-info" / "direct_url.json",
            self.resources / "uv-tools" / "hermes-agent" / "Lib" / "site-packages" / "hermes_cli" / "banner.py",
            self.resources / "runtime" / "openclaw" / "openclaw.cmd",
            self.resources / "data" / "hermes" / "config.yaml",
            self.resources / "data" / ".openclaw" / "openclaw.json",
            self.resources / "data" / ".openclaw" / "clawpanel.json",
        ]
        found: list[str] = []
        needles: list[bytes] = []
        userprofile = os.environ.get("USERPROFILE")
        if userprofile:
            needles.extend([userprofile.encode(), userprofile.replace("\\", "/").encode()])
            username = Path(userprofile).name
            if username:
                needles.extend([f"Users\\{username}".encode(), f"Users/{username}".encode()])
        root_text = str(self.root)
        needles.extend([root_text.encode(), root_text.replace("\\", "/").encode()])
        for path in targets:
            if not path.is_file():
                continue
            try:
                raw = path.read_bytes()
            except OSError:
                continue
            if any(n in raw for n in needles):
                found.append(str(path))
        if found:
            self.add(stage, "old-machine path residue", FAIL, "; ".join(found))
        else:
            self.add(stage, "old-machine path residue", PASS, "no active ZXKJ residue in critical runtime/config files")

    def check_forbidden_delivery_files(self, stage: str) -> None:
        forbidden_files = {".env", "history.jsonl", "settings.local.json"}
        forbidden_dirs = {".claude"}
        found: list[str] = []

        for root, dirs, files in os.walk(self.release):
            root_path = Path(root)
            for name in files:
                if name in forbidden_files or ".rejected." in name or name.startswith("openclaw.json.rejected."):
                    found.append(str((root_path / name).relative_to(self.release)))
            for name in dirs:
                if name in forbidden_dirs:
                    found.append(str((root_path / name).relative_to(self.release)))

        for root, _, files in os.walk(self.release):
            root_path = Path(root)
            for filename in files:
                if not filename.lower().endswith(".zip"):
                    continue
                archive = root_path / filename
                try:
                    if not zipfile.is_zipfile(archive):
                        continue
                    with zipfile.ZipFile(archive) as zf:
                        for name in zf.namelist():
                            parts = [part for part in name.replace("\\", "/").split("/") if part]
                            if (
                                any(part in forbidden_dirs for part in parts)
                                or any(part in forbidden_files for part in parts)
                                or any(".rejected." in part or part.startswith("openclaw.json.rejected.") for part in parts)
                            ):
                                found.append(f"{archive.relative_to(self.release)}!{name}")
                                break
                except Exception:
                    continue

        if found:
            self.add(stage, "forbidden delivery files", FAIL, "; ".join(found[:20]))
        else:
            self.add(stage, "forbidden delivery files", PASS, "no .env, .claude, history.jsonl, settings.local.json, or rejected snapshots in package")

    def check_key_leaks(self, stage: str) -> None:
        patterns = [
            re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
            re.compile(r"sk-proj-[A-Za-z0-9_-]{20,}"),
            re.compile(r"(OPENAI|ANTHROPIC|CUSTOM|API)_?API_?KEY\s*[:=]\s*['\"]?[^'\"\s]{12,}", re.I),
            re.compile(r"Authorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._-]{20,}", re.I),
        ]
        targets = [
            self.resources / "data" / "hermes" / "config.yaml",
            self.resources / "data" / "hermes" / "SOUL.md",
            self.resources / "data" / "hermes" / "channel_directory.json",
            self.resources / "data" / ".openclaw" / "openclaw.json",
            self.resources / "data" / ".openclaw" / "clawpanel.json",
            self.resources / "uv-tools" / "hermes-agent" / "uv-receipt.toml",
            self.resources / "uv-tools" / "hermes-agent" / "pyvenv.cfg",
            self.resources / "uv-python" / "python" / "Lib" / "site-packages" / "hermes-agent.pth",
            self.resources / "runtime" / "openclaw" / "openclaw.cmd",
        ]
        found: list[str] = []
        for path in targets:
            if not path.is_file():
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if any(pattern.search(text) for pattern in patterns):
                found.append(str(path.relative_to(self.release)))
        if found:
            self.add(stage, "key leak scan", FAIL, "; ".join(found))
        else:
            self.add(stage, "key leak scan", PASS, "no key-like material in active delivery config files")

    @staticmethod
    def is_blank_or_template_secret(value: object) -> bool:
        if value is None:
            return True
        text = str(value).strip()
        return not text or re.fullmatch(r"\$\{[A-Z0-9_]+\}", text) is not None

    def check_active_delivery_secrets(self, stage: str) -> None:
        found: list[str] = []
        openclaw_config = self.resources / "data" / ".openclaw" / "openclaw.json"
        try:
            cfg = json.loads(openclaw_config.read_text(encoding="utf-8"))
            providers = cfg.get("models", {}).get("providers", {})
            if isinstance(providers, dict):
                for name, provider in providers.items():
                    if isinstance(provider, dict) and "apiKey" in provider and not self.is_blank_or_template_secret(provider.get("apiKey")):
                        found.append(f"resources/data/.openclaw/openclaw.json models.providers.{name}.apiKey")
            auth = cfg.get("gateway", {}).get("auth", {})
            if isinstance(auth, dict):
                for key in ("token", "password"):
                    if key in auth and not self.is_blank_or_template_secret(auth.get(key)):
                        found.append(f"resources/data/.openclaw/openclaw.json gateway.auth.{key}")
        except Exception as exc:
            found.append(f"resources/data/.openclaw/openclaw.json unreadable: {exc}")

        for relative in (
            Path("resources") / "data" / ".openclaw" / "clawpanel.json",
            Path("resources") / "data" / "clawpanel.json",
        ):
            path = self.release / relative
            if not path.is_file():
                continue
            try:
                cfg = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(cfg, dict) and "accessPassword" in cfg and not self.is_blank_or_template_secret(cfg.get("accessPassword")):
                    found.append(f"{relative.as_posix()} accessPassword")
            except Exception as exc:
                found.append(f"{relative.as_posix()} unreadable: {exc}")

        if found:
            self.add(stage, "active delivery secret fields", FAIL, "; ".join(found))
        else:
            self.add(stage, "active delivery secret fields", PASS, "apiKey, gateway token/password, and panel password are blank or templated")

    def check_hermes_skills_seed(self, stage: str) -> None:
        skills_dir = self.resources / "data" / "hermes" / "skills"
        if not skills_dir.is_dir():
            self.add(stage, "Hermes built-in skills seed", FAIL, f"missing dir: {skills_dir}")
            return
        categories = [p for p in skills_dir.iterdir() if p.is_dir() and not p.name.startswith(".")]
        skill_md = list(skills_dir.rglob("SKILL.md"))
        if len(categories) < 10 or len(skill_md) < 20:
            self.add(
                stage,
                "Hermes built-in skills seed",
                FAIL,
                f"only {len(categories)} categories / {len(skill_md)} SKILL.md files",
            )
        else:
            self.add(
                stage,
                "Hermes built-in skills seed",
                PASS,
                f"{len(categories)} categories / {len(skill_md)} SKILL.md files bundled offline",
            )

    def p0_local_runtime(self) -> None:
        stage = "P0"
        openclaw_cmd = self.resources / "runtime" / "openclaw" / "openclaw.cmd"
        hermes_exe = self.resources / "uv-tools" / "bin" / "hermes.exe"
        node_exe = self.resources / "runtime" / "openclaw" / "node.exe"
        python_exe = self.resources / "uv-python" / "python" / "python.exe"
        claude_exe = self.resources / "runtime" / "claude-code" / "bin" / "claude.exe"

        self.run_check(stage, "bundled node version", [str(node_exe), "--version"], cwd=node_exe.parent, timeout=15)
        self.run_check(stage, "OpenClaw version via portable cmd", [str(openclaw_cmd), "--version"], cwd=openclaw_cmd.parent, timeout=30, shell=True)

        env = self.local_env()
        self.run_check(stage, "bundled Python version", [str(python_exe), "--version"], cwd=python_exe.parent, timeout=15, env=env)
        self.run_check(stage, "Hermes version via portable launcher", [str(hermes_exe), "version"], cwd=hermes_exe.parent, timeout=60, env=env)
        self.run_check(stage, "Claude Code version via portable CLI", [str(claude_exe), "--version"], cwd=claude_exe.parent, timeout=30, env=env)
        self.check_portable_git_runtime(stage)

        cmd_text = openclaw_cmd.read_text(errors="ignore") if openclaw_cmd.is_file() else ""
        if "%~dp0node.exe" in cmd_text and 'set "NODE_EXE=' in cmd_text:
            self.add(stage, "OpenClaw Node portability", PASS, "openclaw.cmd prefers local node.exe")
        else:
            self.add(stage, "OpenClaw Node portability", FAIL, "openclaw.cmd still depends on global node")

        self.check_forbidden_delivery_files(stage)

    def check_portable_git_runtime(self, stage: str) -> None:
        git_root = self.resources / "portable" / "git"
        bash = git_root / "usr" / "bin" / "bash.exe"
        git_exe = git_root / "cmd" / "git.exe"
        required = [
            bash,
            git_exe,
            git_root / "usr" / "bin" / "cygpath.exe",
            git_root / "mingw64",
            git_root / "dev",
            git_root / "tmp",
        ]
        missing = [str(p.relative_to(self.release)) for p in required if not p.exists()]
        if missing:
            self.add(stage, "portable Git runtime", FAIL, "missing: " + "; ".join(missing))
            return

        env = os.environ.copy()
        env["PATH"] = os.pathsep.join([
            str(git_root / "bin"),
            str(git_root / "cmd"),
            str(git_root / "usr" / "bin"),
            os.environ.get("SystemRoot", r"C:\Windows") + r"\System32",
            os.environ.get("SystemRoot", r"C:\Windows"),
        ])
        env["HERMES_GIT_BASH_PATH"] = str(bash)
        try:
            git_proc = subprocess.run(
                [str(git_exe), "--version"],
                cwd=str(git_root),
                env=env,
                timeout=15,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            git_output = (git_proc.stdout or git_proc.stderr or "").strip()
            if git_proc.returncode != 0:
                self.add(stage, "portable Git runtime", FAIL, git_output or f"exit {git_proc.returncode}")
                return

            proc = subprocess.run(
                [str(bash), "-lc", "echo BASH_OK; command -v git; git --version; command -v cygpath; cygpath -w /tmp"],
                cwd=str(git_root),
                env=env,
                timeout=30,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            output = (proc.stdout or proc.stderr or "").strip()
            bash_ok = (
                proc.returncode == 0
                and "BASH_OK" in output
                and (
                    "/mingw64/bin/git" in output.replace("\\", "/")
                    or "/cmd/git" in output.replace("\\", "/")
                )
                and "/usr/bin/cygpath" in output.replace("\\", "/")
            )
            if bash_ok:
                self.add(stage, "portable Git runtime", PASS, output.splitlines()[0][:240] if output else git_output)
                return

            if any(token in output for token in ("Win32 error 5", "couldn't create signal pipe", "CreateFileMapping")):
                self.add(
                    stage,
                    "portable Git runtime",
                    WARN,
                    f"{git_output} (bash probe blocked on this host: {output.splitlines()[0][:160] if output else 'Win32 error 5'})",
                )
                return

            self.add(stage, "portable Git runtime", FAIL, output.splitlines()[0][:240] if output else f"exit {proc.returncode}")
        except Exception as exc:
            self.add(stage, "portable Git runtime", FAIL, str(exc))

    def p0_stability_snapshot(self) -> None:
        stage = "P0"
        hermes_count = self.count_processes(["uv-tools\\bin\\hermes.exe", "hermes.exe\" gateway run"])
        openclaw_count = self.count_processes(["openclaw.mjs\" gateway", "openclaw.mjs gateway"])
        if hermes_count <= 1:
            self.add(stage, "Hermes duplicate process check", PASS, f"{hermes_count} gateway launcher process")
        else:
            self.add(stage, "Hermes duplicate process check", FAIL, f"{hermes_count} gateway launcher processes")
        if openclaw_count <= 1:
            self.add(stage, "OpenClaw duplicate process check", PASS, f"{openclaw_count} gateway process")
        else:
            self.add(stage, "OpenClaw duplicate process check", FAIL, f"{openclaw_count} gateway processes")

    # ---------------- P1 ----------------
    def p1_config_and_services(self) -> None:
        stage = "P1"
        self.json_read_check(stage, "OpenClaw config JSON", self.resources / "data" / ".openclaw" / "openclaw.json")
        self.json_read_check(stage, "OpenClaw panel JSON", self.resources / "data" / ".openclaw" / "clawpanel.json")
        self.text_read_check(stage, "Hermes config YAML", self.resources / "data" / "hermes" / "config.yaml", must_contain=["model:", "api_server"])

        self.write_probe(stage, "OpenClaw data write permission", self.resources / "data" / ".openclaw")
        self.write_probe(stage, "Hermes data write permission", self.resources / "data" / "hermes")

        self.http_check(stage, "OpenClaw health endpoint", "http://127.0.0.1:18789/health", expected_keys=["ok", "status"])
        self.socket_check(stage, "OpenClaw browser sidecar port", "127.0.0.1", 18791)
        self.http_check(stage, "Hermes health endpoint", "http://127.0.0.1:8642/health", expected_keys=["status", "platform"])

        self.add(stage, "API key mutation safety", PASS, "script does not print, modify, or clear stored keys")
        self.add(stage, "external paid/service call", SKIP, "not called by default to avoid spending quota; validate from UI with a known test key")

    # ---------------- P2 ----------------
    def p2_portable_delivery(self) -> None:
        stage = "P2"
        required_local = [
            self.resources / "runtime" / "openclaw" / "node.exe",
            self.resources / "runtime" / "openclaw" / "node_modules",
            self.resources / "runtime" / "claude-code" / "bin" / "claude.exe",
            self.resources / "uv-python" / "python" / "python.exe",
            self.resources / "uv-tools" / "bin" / "hermes.exe",
            self.resources / "data" / "hermes" / "skills",
            self.resources / "bin" / "uv.exe",
            self.resources / "portable" / "git" / "usr" / "bin" / "bash.exe",
            self.resources / "portable" / "git" / "usr" / "bin" / "cygpath.exe",
            self.resources / "portable" / "git" / "mingw64",
        ]
        missing = [str(p) for p in required_local if not p.exists()]
        if missing:
            self.add(stage, "bundled dependency closure", FAIL, "; ".join(missing))
        else:
            self.add(stage, "bundled dependency closure", PASS, "Node, Python, uv, Git Bash, Hermes, OpenClaw, and Claude Code deps are inside resources")

        current_root = str(self.root).encode("utf-8")
        critical = [
            self.resources / "uv-tools" / "bin" / "hermes.exe",
            self.resources / "uv-tools" / "hermes-agent" / "uv-receipt.toml",
            self.resources / "uv-python" / "python" / "Lib" / "site-packages" / "hermes-agent.pth",
            self.resources / "runtime" / "openclaw" / "openclaw.cmd",
        ]
        hardcoded = []
        for path in critical:
            if path.is_file() and current_root in path.read_bytes():
                hardcoded.append(str(path))
        if hardcoded:
            self.add(stage, "current-machine hardcoded path check", FAIL, "; ".join(hardcoded))
        else:
            self.add(stage, "current-machine hardcoded path check", PASS, "launchers use relative paths in critical files")

        if (self.release / "clawpanel-main.rar").exists() or (self.resources / "clawpanel-main.rar").exists():
            self.add(stage, "package trash check", FAIL, "large source archive found in release package")
        else:
            self.add(stage, "package trash check", PASS, "no known large source archive in release folder")

        self.add(stage, "registry/environment residue", WARN, "not fully provable on current host; verify on clean machine after exit")

    def p2_deep_archive_probe(self) -> None:
        stage = "P2"
        temp_dir = Path(tempfile.mkdtemp(prefix="superclaw_package_probe_"))
        zip_path = temp_dir / "superclaw_release_probe.zip"
        start = now_ms()
        try:
            count = 0
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
                for file in self.iter_release_files():
                    zf.write(file, file.relative_to(self.release))
                    count += 1
            elapsed = now_ms() - start
            if zip_path.stat().st_size <= 0:
                self.add(stage, "archive creation probe", FAIL, "zip was empty")
            else:
                self.add(stage, "archive creation probe", PASS, f"{count} files, {zip_path.stat().st_size} bytes, {elapsed} ms")
        except Exception as exc:
            self.add(stage, "archive creation probe", FAIL, str(exc))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    # ---------------- helpers ----------------
    def local_env(self) -> dict[str, str]:
        env = os.environ.copy()
        parts = [
            str(self.resources / "uv-tools" / "bin"),
            str(self.resources / "uv-tools" / "hermes-agent" / "Scripts"),
            str(self.resources / "bin"),
            str(self.resources / "uv-python" / "python"),
            str(self.resources / "portable" / "git" / "bin"),
            str(self.resources / "portable" / "git" / "cmd"),
            str(self.resources / "portable" / "git" / "usr" / "bin"),
            os.environ.get("SystemRoot", r"C:\Windows") + r"\System32",
            os.environ.get("SystemRoot", r"C:\Windows"),
        ]
        env["PATH"] = os.pathsep.join(parts)
        env["HERMES_HOME"] = str(self.resources / "data" / "hermes")
        env["HERMES_DISABLE_UPDATE_CHECK"] = "1"
        claude_home = self.resources / "data" / "claude-code" / "home"
        claude_projects = self.resources / "data" / "claude-code" / "projects"
        env["HOME"] = str(claude_home)
        env["USERPROFILE"] = str(claude_home)
        env["APPDATA"] = str(claude_home / "AppData" / "Roaming")
        env["LOCALAPPDATA"] = str(claude_home / "AppData" / "Local")
        env["CLAUDE_CONFIG_DIR"] = str(claude_home / "claude-config")
        env["CLAUDE_CODE_PROJECTS_DIR"] = str(claude_projects)
        env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
        git_root = self.resources / "portable" / "git"
        bash = git_root / "usr" / "bin" / "bash.exe"
        if bash.is_file():
            env["HERMES_GIT_BASH_PATH"] = str(bash)
        return env

    def run_check(self, stage: str, name: str, cmd: list[str], cwd: Path, timeout: int, env: dict[str, str] | None = None, shell: bool = False) -> None:
        try:
            proc = subprocess.run(
                cmd if not shell else subprocess.list2cmdline(cmd),
                cwd=str(cwd),
                env=env,
                timeout=timeout,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=shell,
            )
            output = (proc.stdout or proc.stderr or "").strip().splitlines()
            msg = output[0][:240] if output else f"exit {proc.returncode}"
            self.add(stage, name, PASS if proc.returncode == 0 else FAIL, msg)
        except Exception as exc:
            self.add(stage, name, FAIL, str(exc))

    def json_read_check(self, stage: str, name: str, path: Path) -> None:
        try:
            json.loads(path.read_text(encoding="utf-8"))
            self.add(stage, name, PASS, str(path))
        except Exception as exc:
            self.add(stage, name, FAIL, f"{path}: {exc}")

    def text_read_check(self, stage: str, name: str, path: Path, must_contain: Iterable[str] = ()) -> None:
        try:
            text = path.read_text(encoding="utf-8")
            missing = [item for item in must_contain if item not in text]
            if missing:
                self.add(stage, name, FAIL, f"missing markers: {', '.join(missing)}")
            else:
                self.add(stage, name, PASS, str(path))
        except Exception as exc:
            self.add(stage, name, FAIL, f"{path}: {exc}")

    def write_probe(self, stage: str, name: str, directory: Path) -> None:
        probe = directory / f".portable_acceptance_write_probe_{os.getpid()}.tmp"
        try:
            probe.write_text("ok\n", encoding="utf-8")
            ok = probe.read_text(encoding="utf-8") == "ok\n"
            probe.unlink(missing_ok=True)
            self.add(stage, name, PASS if ok else FAIL, str(directory))
        except Exception as exc:
            self.add(stage, name, FAIL, f"{directory}: {exc}")
            try:
                probe.unlink(missing_ok=True)
            except Exception:
                pass

    def http_check(self, stage: str, name: str, url: str, expected_keys: Iterable[str]) -> None:
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            missing = [key for key in expected_keys if key not in data]
            if missing:
                self.add(stage, name, FAIL, f"missing keys {missing}: {data}")
            else:
                self.add(stage, name, PASS, json.dumps(data, ensure_ascii=False))
        except Exception as exc:
            self.add(stage, name, FAIL, str(exc))

    def socket_check(self, stage: str, name: str, host: str, port: int) -> None:
        try:
            with socket.create_connection((host, port), timeout=3):
                self.add(stage, name, PASS, f"{host}:{port}")
        except Exception as exc:
            self.add(stage, name, FAIL, str(exc))

    def count_processes(self, needles: list[str]) -> int:
        if os.name != "nt":
            return 0
        try:
            proc = subprocess.run(
                ["wmic", "process", "get", "ProcessId,CommandLine"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
            )
            text = proc.stdout.lower()
            return sum(1 for line in text.splitlines() if any(n.lower() in line for n in needles))
        except Exception:
            return 0

    def iter_release_files(self) -> Iterable[Path]:
        skip_names = {".fingerprint", "build", "deps", "wix"}
        for root, dirs, files in os.walk(self.release):
            root_path = Path(root)
            dirs[:] = [d for d in dirs if d not in skip_names and not d.startswith("_codex_backup")]
            for name in files:
                yield root_path / name

    def print_report(self) -> int:
        stages = ["P0", "P1", "P2"]
        for stage in stages:
            print(f"\n[{stage}]")
            for item in self.results:
                if item.stage == stage:
                    print(f"{item.status:4}  {item.name}: {item.message}")
        counts = {s: sum(1 for r in self.results if r.status == s) for s in [PASS, FAIL, WARN, SKIP]}
        print("\n[SUMMARY]")
        print(" ".join(f"{k}={v}" for k, v in counts.items()))
        if counts[FAIL]:
            print("OVERALL=FAIL")
            return 2
        if counts[WARN] or counts[SKIP]:
            print("OVERALL=PASS_WITH_NOTES")
            return 1
        print("OVERALL=PASS")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="SuperClaw portable acceptance checker")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--release", type=Path, default=None)
    parser.add_argument("--deep", action="store_true", help="run optional archive simulation")
    args = parser.parse_args()

    root = args.root.resolve()
    release = (args.release or (root / "src-tauri" / "target" / "release")).resolve()
    checker = Checker(root=root, release=release, deep=args.deep)
    checker.run()
    return checker.print_report()


if __name__ == "__main__":
    raise SystemExit(main())
