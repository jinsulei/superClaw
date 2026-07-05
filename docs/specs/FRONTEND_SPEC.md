# Frontend Spec

Frontend is Layer 7: Frontend Presentation. It presents Hermes task state without owning agent, tool, gateway, runtime, or business execution.

Frontend must not directly carry new business workflows. Existing `src/engines/hermes/pages/chat.js` temporarily contains historical business logic and must be preserved, then gradually migrated through Layer 3 Core Task Runtime, Layer 5 Observability, and Layer 6 Business Modules.

## Required Surfaces

- Dialog Timeline: user messages, task summaries, task events, result cards.
- Task Panel: task id, type, status, topology, permission level, and current step.
- Progress Bubble: compact visible execution progress.
- Agent Status: Hermes, OpenClaw, Claude Code, Codex, and platform readiness.
- Debug Panel: ids, durations, error codes, and event traces.
- Result Cards: final Hermes judgment and evidence summary.
- Approval Modal: L2 action confirmation before write, publish, spend, send, or state-changing actions.

Progress Bubble must depend on Layer 5 `task_events`. Debug Panel must depend on Layer 5 `tool_runs` and `agent_runs`. Frontend should render these contracts; it should not create a second event/task system.

## Display Rules

- Normal mode shows execution summaries and user-relevant progress.
- Debug mode may show `task_id`, `tool_run_id`, `agent_run_id`, `duration`, `error_code`, event payload shape, and health state.
- The UI must not display hidden model reasoning, secrets, tokens, local private paths, or raw credential values.
