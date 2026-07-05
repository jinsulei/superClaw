# Module Ownership Map

| Current path | Architecture layer | Future migration needed | Current freeze | Notes |
| --- | --- | --- | --- | --- |
| `scripts/dev-api.js` | Layer 2 Gateway / Runtime Process Bridge | Yes | Yes | Future split only after contract tests; current high-risk hub stays frozen. |
| `src-tauri/src/commands/*` | Layer 2 Gateway / Tauri Command Bridge | Maybe | Yes for broad refactor | Keep as desktop bridge; audit before runtime packaging changes. |
| `src-tauri/resources/*` | Layer 1 Runtime / Packaging | Maybe | Yes | Package only reviewed runtime assets; real runtime/data/secrets stay isolated. |
| `src/lib/collaboration.js` | Layer 3 Core Task Runtime candidate | Yes | No broad rewrite | Candidate source for task primitives and dispatch rules; no parallel task system. |
| `src/engines/hermes/pages/chat.js` | Layer 7 Frontend + historical business logic | Yes | Yes for large rewrite | Preserve current behavior; gradually migrate business logic to Layer 3/6. |
| `src/engines/hermes/pages/claude-code.js` | Layer 7 Frontend + Layer 4 Claude Adapter-facing | Yes | No broad rewrite | Wrap existing panel flow before extracting adapter behavior. |
| `src/engines/openclaw/*` | Layer 7 Frontend + Layer 4 OpenClaw Adapter-facing | Yes | No broad rewrite | Should become adapter-facing, not direct business dependency. |
| `src/shared/ecommerce-stage*` | Layer 6 Business Modules / E-Commerce | Yes | No broad rewrite | Future work connects global Action Guard and observability. |
| `src/engines/hermes/lib/hermes-ecommerce-*` | Layer 6 Business Modules / E-Commerce | Yes | No | Patch existing ecommerce logic; no second ecommerce stack. |
| `src/engines/hermes/lib/hermes-ecommerce-link-reader.js` | Layer 6 Business Modules / Link Reader | Yes | No | Patch existing link reader path; no second link reader. |
| `src/engines/hermes/lib/hermes-image-capability.js` | Layer 6 Business Modules / Generation | Yes | No | Wrap with Model Adapter/Generation contract later. |
| `src/lib/model-presets.js` | Layer 4 Model Adapter + Layer 6 Generation | Maybe | No | Keep as current model evidence; do not claim full adapter. |
| `src/lib/ws-client.js` | Layer 5 Observability heartbeat source | Maybe | No | Wrap heartbeat into Observability schema. |
| `src/lib/agent-gateway-status.js` | Layer 5 Observability + Layer 2 Gateway status | Maybe | No | Wrap status into `agent_runs`/`task_events`. |
| `docs/*` | Layer 0 Engineering Governance | No | No | Specs and registries live here. |
| `tests/*` | Layer 8 Tests / Release Gates | Yes | No | Add contract and regression tests before risky extraction. |
