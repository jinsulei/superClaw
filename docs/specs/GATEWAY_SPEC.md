# Gateway Spec

## Layer

Gateway is Layer 2: Gateway / Process Bridge.

## Responsibilities

Gateway is the boundary between frontend, business modules, agents, tools, local runtime processes, and platform APIs. It must not own business judgment; Hermes/Core Task Runtime and Business Modules own task intent and domain rules.

## Required Areas

- API Routes: stable task, status, event, health, and capability endpoints.
- Event Stream: SSE or WebSocket task events for UI timeline and progress.
- Agent Bridge: normalized access to OpenClaw, Claude Code, Codex, and Hermes-facing agents.
- Tool Bridge: normalized tool execution and tool result capture.
- Runtime Process Manager: start, stop, health, and watchdog behavior for local runtimes.
- Health Check: runtime, gateway, agent, and tool readiness.
- Security Guard: permission checks, secret exclusion, Action Guard, and audit events.

## Hard Boundary

Frontend and business modules must not call OpenClaw or Claude Code directly. They must call Gateway or Task Framework surfaces, which then use adapters and guards.

## Current Candidate Paths

- `scripts/dev-api.js`: current dev gateway and runtime bridge candidate.
- `src/lib/ws-client.js`: event stream candidate.
- `src-tauri/src/commands/*`: desktop command bridge.

## Current State

`scripts/dev-api.js` is a high-risk concentration point for dev API routes, relays, runtime process management, OpenClaw Gateway launch config, MiniMax provider config, Claude relay, status, health, file/zip/resource handling, and Hermes stream handling. This phase does not split it.

Future Gateway extraction must happen only after contract tests exist for observability, adapter boundaries, health/status behavior, and runtime process ownership.
