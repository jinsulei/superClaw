---
name: superclaw-codebase
description: SuperClaw codebase orientation for locating frontend pages, Tauri commands, runtime resources, and package templates without relying on machine-specific paths.
---

# SuperClaw Codebase Orientation

SuperClaw is a Tauri desktop client. The delivered product is a portable desktop package. Web dev mode is only for local debugging and must not be treated as the final delivery shape.

## Core Areas

- `src/`: frontend pages, chat flows, model configuration, and shared UI components.
- `src-tauri/src/`: Tauri commands, local service control, runtime paths, and desktop-side commands.
- `src-tauri/resources/runtime/`: bundled local runtimes used by the desktop package.
- `src-tauri/resources/data/`: default runtime data templates for Hermes, OpenClaw, ClaudeCode, and shared resources.
- `scripts/build-desktop-client.ps1`: portable desktop package builder.

## Investigation Workflow

When asked where a feature lives or why it behaves a certain way:

1. Start with the visible frontend route or page under `src/`.
2. Follow shared helpers under `src/lib/` and agent-specific helpers under `src/engines/`.
3. Check Tauri command bindings under `src-tauri/src/` only when the feature crosses into desktop/runtime behavior.
4. For packaged behavior, inspect `scripts/build-desktop-client.ps1` and `src-tauri/resources/`.
5. Treat older branches, old packages, local logs, and machine-specific paths as historical context only.

## Packaging Rules

- Do not bundle real API keys, tokens, sessions, logs, lock files, user history, or machine-specific absolute paths.
- Model credentials must remain runtime-configurable.
- OpenClaw MiniMax testing may expose a local input entry, but the package must not contain a real key.
- Keep guard and sanitizer tests where they prevent old API, auth, or local-state regressions.

## Safety Notes

- Prefer small, scoped changes.
- Do not copy whole files from old branches.
- Do not reintroduce old yyapi/auth/payment/license runtime behavior.
- Do not hardcode local backend paths or developer machine paths in packaged resources.
