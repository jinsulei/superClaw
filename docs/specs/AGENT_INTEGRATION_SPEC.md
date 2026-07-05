# Agent Integration Spec

Agent Integration is Layer 4: Agent / Tool Integration. It is adapter-first as the Hermes 1.0.7 target. The current project does not yet have one unified Adapter layer.

OpenClaw, Hermes, and Claude Code are real current integrations, but they are distributed across frontend pages, Tauri commands, and `scripts/dev-api.js`. Codex currently has provider/reserved UI signals, but no clear runtime Adapter; treat Codex as `reserved` or `planned`, not implemented.

## Adapter Set

- OpenClaw Adapter: UI automation, screen observation, platform fallback, generation execution.
- Claude Code Adapter: code-oriented analysis, local engineering assistance, structured reports.
- Codex Adapter: Codex task assistance and upgrade-compatible capability calls.
- Model Adapter: model provider prompts, generation prompt shaping, provider-specific normalization.
- Platform Adapter: ecommerce, WeChat, live room, market data, and other platform APIs.
- Tool Adapter: local utility execution with audit and result capture.

## Dispatcher

Agent Dispatcher is the target convergence point. It should select adapters from task type, permission level, topology, health, and capability registry. It must emit required `agent_runs` and audit events.

Current state: partial. Collaboration dispatch exists in the Hermes UI and local collaboration store, but it is not a unified Agent Dispatcher.

## Capability Registry

All agent and tool capabilities must be declared before use. Capabilities include provider, risk level, permission requirement, adapter requirement, and supported task types.

## Prohibition

Business modules must not depend on OpenClaw, Claude Code, Codex, or model-provider concrete versions. They depend on adapter contracts only.

Future changes must wrap or patch existing OpenClaw, Hermes, and Claude Code integration paths before extracting them. Do not create a second parallel agent integration stack.

Layer 6 Business Modules must not directly call OpenClaw, Claude Code, Codex, model providers, platform APIs, or local tools. They must go through Layer 3 task runtime, Layer 4 Dispatcher/Adapter contracts, and Layer 5 observability events.
