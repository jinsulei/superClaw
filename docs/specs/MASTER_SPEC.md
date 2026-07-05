# Hermes 1.0.7 Master Spec

Hermes 1.0.7 defines a unified task skeleton for eight function domains. All tasks are finally judged, verified, and reported by Hermes, even when OpenClaw, Claude Code, Codex, platform APIs, tools, or generation models participate.

## Function Domains

1. Hermes Task Framework
2. Link Reader
3. Collaboration / Watch Tasks
4. E-Commerce Ops
5. WeChat Customer Ops
6. Generation / PPT
7. Observability / Dialog Timeline
8. Runtime / Upgrade / Portable EXE

## Architecture Layer Order

0. Engineering Governance: specs, registries, ownership, capability policy, and compatibility rules.
1. Runtime / Packaging: portable EXE boundary, runtime/data/secrets isolation, old/wrong package exclusion.
2. Gateway / Process Bridge: dev API, Tauri command bridge, runtime process lifecycle, relays, health/status.
3. Core Task Runtime: task schema, task state, Permission Engine, Action Guard entry, Verification Engine.
4. Agent / Tool Integration: Dispatcher, adapters, tools, models, platform APIs.
5. Observability / Audit: `task_events`, `tool_runs`, `agent_runs`, heartbeat, audit log.
6. Business Modules: Link Reader, collaboration/watch, ecommerce, WeChat customer ops, generation/PPT, market/publishing.
7. Frontend Presentation: chat, task panel, progress bubble, debug panel, result cards, approval modal.
8. Tests / Release Gates: contract tests, regression tests, packaging audit, release checklist.

The layer order is intentional: runtime boundaries and gateway/process contracts come before task runtime, adapters, business modules, and UI. Planned or reserved capabilities must not be documented as implemented.

## Core Principles

- Hermes owns final judgment, acceptance, and user-facing report.
- L1 tasks may draft, read, classify, summarize, or recommend.
- L2 tasks may write, publish, spend money, change price, send messages, or operate persistent state only after explicit permission.
- App-first, OCR-first, single-page web reuse, and configurable API enhancement are preferred for watch and collaboration tasks.
- Business modules must go through Gateway, Adapter, Task Framework, Action Guard, and audit requirements.
- Runtime, data, and secrets must remain isolated for portable EXE delivery.
- Upgrades for OpenClaw, Hermes, Claude Code, and Codex must be protected by adapter contracts, capability registry, contract tests, and regression tests.
- All fixes must patch, wrap, or later extract existing code; creating a second parallel implementation for an existing feature is prohibited.
