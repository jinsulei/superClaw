# Hermes 1.0.7 Architecture

This document freezes the navigation skeleton for Hermes 1.0.7. It does not move code, split `scripts/dev-api.js`, change runtime assets, or change package configuration.

## Hermes 1.0.7 Layer Order

| Layer | Name | Responsibility | Current evidence paths | Migration principle |
| --- | --- | --- | --- | --- |
| 0 | Engineering Governance | Specs, registries, architecture rules, ownership map, capability map, compatibility policy. | `docs/*`, `AGENTS.md` | Governance changes first; do not encode planned/reserved as implemented. |
| 1 | Runtime / Packaging | Portable EXE boundary, runtime assets, sidecars, local data, old/wrong package exclusion, secret exclusion. | `src-tauri/resources/*`, `src-tauri/tauri.conf.json`, `scripts/build-*`, `scripts/package-*`, `scripts/preflight-*` | Define packaging boundary before broad business changes; freeze runtime/data/secrets. |
| 2 | Gateway / Process Bridge | API routes, Tauri command bridge, process lifecycle, health, status, relay, local runtime bridge. | `scripts/dev-api.js`, `src-tauri/src/commands/*`, `src/lib/agent-gateway-status.js` | `scripts/dev-api.js` is frozen as a high-risk hub until contract tests exist; extract later. |
| 3 | Core Task Runtime | Task object, task state, Permission Engine, Action Guard entry, Verification Engine, dispatcher candidate. | `src/lib/collaboration.js`, `src/engines/hermes/pages/chat.js` | Patch/wrap existing task primitives; no second task system. |
| 4 | Agent / Tool Integration | OpenClaw, Hermes, Claude Code, Codex, model, platform, and tool adapter contracts. | `src/engines/openclaw/*`, `src/engines/hermes/pages/claude-code.js`, `src/lib/model-presets.js`, `src-tauri/src/commands/claude_code.rs` | Use Dispatcher + Adapter contracts; Codex remains reserved/planned until runtime adapter exists. |
| 5 | Observability / Audit | `task_events`, `tool_runs`, `agent_runs`, heartbeat, audit log, debug data contract. | `docs/specs/OBSERVABILITY_SCHEMA_CONTRACT.md`, `src/lib/ws-client.js`, `src/lib/collaboration.js`, `src/engines/hermes/lib/chat-store.js` | Schema first, wrapper second, UI later; no parallel event system. |
| 6 | Business Modules | Link Reader, collaboration/watch, ecommerce, WeChat customer ops, generation/PPT, market watch, publishing. | `src/shared/ecommerce-stage*`, `src/engines/hermes/lib/hermes-ecommerce-*`, `src/engines/hermes/lib/hermes-image-capability.js` | Patch existing modules; business modules must not call agents directly. |
| 7 | Frontend Presentation | Chat, task panel, progress bubble, debug panel, result cards, approval modal, status display. | `src/engines/hermes/pages/chat.js`, `src/engines/hermes/pages/claude-code.js`, `src/engines/openclaw/*` | Presentation only over time; current chat.js is preserved and gradually migrated. |
| 8 | Tests / Release Gates | Contract tests, regression tests, packaging audit, release checklist, upgrade gates. | `tests/*`, `scripts/smoke-*`, `tests/contract/README.md`, `tests/regression/README.md` | Add gates before risky extraction or packaging changes. |

## Current Path Mapping

| Current path | Target owner | Current rule |
| --- | --- | --- |
| `scripts/dev-api.js` | Gateway / Runtime Process / Agent Bridge | Keep in place for now; do not expand further unless separately approved. |
| `src/lib/collaboration.js` | Core Runtime / Task Framework candidate | Candidate only; no migration in this phase. |
| `src/engines/hermes/*` | Hermes UI / Hermes engine-facing UI | Keep existing behavior. |
| `src/engines/openclaw/*` | OpenClaw UI / adapter-facing surface | Must not become the direct business integration layer. |
| `src-tauri/src/commands/*` | Tauri command bridge | Desktop bridge only; runtime behavior requires later audit. |
| `src-tauri/resources/runtime/*` | Runtime Packaging | Ship only reviewed runtime assets. |
| `src-tauri/resources/data/*` | Local data templates / runtime data boundary | Do not ship real user data or secrets. |
| `docs/*` | Engineering Governance | Source of navigation and contracts. |
| `tests/*` | Layer 8 Tests / Release Gates | Contract and regression gates for future changes. |

## Current Implementation vs Target Architecture

The documents under `docs/specs/` and `docs/registry/` describe the Hermes 1.0.7 target skeleton. They do not mean that every listed capability is already fully implemented.

Before fixing any function domain, contributors must first locate the existing source path and patch, wrap, or later extract that implementation. Creating a second parallel implementation for the same Link Reader, collaboration task flow, ecommerce workflow, generation flow, or agent bridge is prohibited.

If an adapter or wrapper is required, it must keep the old entrypoint compatible while gradually converging calls into one primary path. Wrappers are a transition boundary, not a second product surface.

`scripts/dev-api.js` is currently a high-risk concentration point for Gateway, runtime process, MiniMax config, OpenClaw, Hermes, Claude relay, and agent status behavior. This phase does not split it.

The frontend currently still carries substantial business flow logic, especially in Hermes chat and ecommerce stages. Future work should move ownership toward Core Runtime, Business Modules, and Gateway in small tested steps, not through a large one-shot migration.

## 1.0.7 Rule

Hermes 1.0.7 first hardens ownership and contracts. Business logic migration, gateway splitting, Tauri packaging changes, and runtime/data cleanup must be separate tasks with tests.
