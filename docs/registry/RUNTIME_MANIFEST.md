# Runtime Manifest

This manifest is the first Hermes 1.0.7 runtime packaging gate. It records candidate runtime assets that may be reviewed for the portable EXE. It does not mark any runtime as verified and does not contain secrets.

Checksum values are intentionally `needs_review` until a release task records source, version, size, license, and hash from a clean packaging snapshot.

| runtime_name | runtime_version | source | checksum | allowed_in_portable | required_for_features | package_path | dev_path | license | size | review_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-panel | needs_review | bundled runtime asset | needs_review | yes_after_review | Claude Code panel / relay surface | `resources/runtime/claude-panel/` | `src-tauri/resources/runtime/claude-panel/` | needs_review | needs_review | needs_review |
| openclaw | needs_review | bundled runtime asset | needs_review | yes_after_review | OpenClaw agent, browser/tool bridge, ecommerce fallback | `resources/runtime/openclaw/` | `src-tauri/resources/runtime/openclaw/` | needs_review | needs_review | needs_review |
| hermes-agent | needs_review | bundled Python runtime asset | needs_review | yes_after_review | Hermes gateway and agent runtime | `resources/runtime/hermes-agent/` | `src-tauri/resources/runtime/hermes-agent/` | needs_review | needs_review | needs_review |
| uv-python | Python 3.11.13 | controlled import from `C:/tmp/SuperClaw-1.0.3-merge-exe-test/resources/runtime/uv-python` via `C:/tmp/superclaw-runtime-staging/uv-python` | `sha256-dir:7af852e030724b44eb595409d876bd08dd7b9f2d304a5c214c38ac25b9c8dac1` | yes_after_review | Hermes Python execution / portable agent runtime | `resources/runtime/uv-python/` | `src-tauri/resources/runtime/uv-python/` | Python Software Foundation License | 3872 files | accepted_staging_scan_2026-07-07 |
| uv-tools | uv 0.7.12 | controlled import from `C:/tmp/SuperClaw-1.0.3-merge-exe-test/resources/runtime/uv-tools` via `C:/tmp/superclaw-runtime-staging/uv-tools` | `sha256-dir:1c52ba55457aac3bf78a25acdf19d52a5eda724c575c94d4d6677f210a806d71` | yes_after_review | Hermes uv tool execution / portable dependency tooling | `resources/runtime/uv-tools/` | `src-tauri/resources/runtime/uv-tools/` | MIT OR Apache-2.0 | 4 files | accepted_staging_scan_2026-07-07 |
| ocr | needs_review | bundled OCR runtime asset | needs_review | yes_after_review | OCR / readable image support | `resources/runtime/ocr/` | `src-tauri/resources/runtime/ocr/` | needs_review | needs_review | needs_review |
| video-tools | needs_review | bundled video runtime asset | needs_review | yes_after_review | video / media extraction support | `resources/runtime/video-tools/` | `src-tauri/resources/runtime/video-tools/` | needs_review | needs_review | needs_review |
| uv.exe | needs_review | bundled executable | needs_review | yes_after_review | Python/runtime dependency installation in portable flow | `resources/bin/uv.exe` | `src-tauri/resources/bin/uv.exe` | needs_review | needs_review | needs_review |
| uvw.exe | needs_review | bundled executable | needs_review | yes_after_review | uv Windows helper | `resources/bin/uvw.exe` | `src-tauri/resources/bin/uvw.exe` | needs_review | needs_review | needs_review |
| uvx.exe | needs_review | bundled executable | needs_review | yes_after_review | uv tool runner | `resources/bin/uvx.exe` | `src-tauri/resources/bin/uvx.exe` | needs_review | needs_review | needs_review |
| desktop-control-agent.exe | needs_review | bundled executable | needs_review | yes_after_review | desktop control bridge / OpenClaw plugin | `resources/bin/desktop-control-agent.exe` | `src-tauri/resources/bin/desktop-control-agent.exe` | needs_review | needs_review | needs_review |
| hermes-agent-main.zip | needs_review | bundled source archive | needs_review | yes_after_review | Hermes source fallback / runtime setup | `resources/hermes-agent-main.zip` | `src-tauri/resources/hermes-agent-main.zip` | needs_review | needs_review | needs_review |

## Packaging Rules

- Do not package whole `resources/data` globs.
- Do not package root runtime caches.
- Do not package `.env`, `openclaw.json`, `relay-config.json`, relay config values, auth files, logs, sessions, memories, databases, browser profile data, pid files, lock files, `runtime/data/secrets`, secrets, or user state.
- Generate sanitized portable data through the approved packaging flow.
- Treat legacy portable scripts as deprecated entrypoints.

## Portable Runtime Source Acceptance

- `uv-python` must be reviewed from a clean runtime source snapshot and must contain a `python.exe` probe before it can be copied into a release candidate.
- `uv-tools` must be reviewed from a clean runtime source snapshot and must contain a `uv.exe` probe before it can be copied into a release candidate.
- Each accepted runtime source must record source, runtime_version, checksum, license, size, package_path, dev_path, and review_status in this manifest.
- Runtime sources must not contain `.env`, `openclaw.json`, `relay-config.json`, logs, db files, sessions, browser profile data, `runtime/data/secrets`, secrets, auth files, pid files, lock files, or user state.
- Release gates may validate this contract, but they must not download runtime sources, copy old packages, build the desktop candidate, or run U-disk packaging.
