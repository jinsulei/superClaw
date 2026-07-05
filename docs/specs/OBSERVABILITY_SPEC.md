# Observability Spec

Observability is Layer 5: Observability / Audit. It records execution trajectory without exposing hidden reasoning or secrets. It is not a Frontend subfeature.

Current state is partial, not a unified event model. Existing evidence includes chat messages, Hermes tool debug rows, local collaboration task messages, WebSocket heartbeat fragments, and runtime/guardian status signals.

The Hermes 1.0.7 target is one normalized model for `task_events`, `tool_runs`, `agent_runs`, heartbeat, progress bubble, debug panel, checkpoint, and audit log.

The first priority is to define event schemas and source mapping. UI changes should follow the schema, not lead it.

Version 1 wraps existing messages, debug rows, stream events, heartbeat/status fragments, guardian events, and ecommerce confirmation/risk events. It does not rewrite UI first.

The schema contract is defined in `docs/specs/OBSERVABILITY_SCHEMA_CONTRACT.md`. Current code remains partial until existing messages, debug rows, stream events, heartbeat, guardian events, and ecommerce confirmation events are wrapped into that contract.

## Execution Order

1. Schema contract.
2. Wrapper plan for existing sources.
3. Contract tests.
4. UI progress bubble.
5. Debug panel.

## Event Streams

- `task_events`: task lifecycle and user-visible progress.
- `tool_runs`: tool invocation, result summary, timing, and error.
- `agent_runs`: adapter/agent invocation, result summary, timing, and error.
- `heartbeat`: agent, gateway, runtime, and tool readiness.
- `checkpoint`: resumable task state marker.
- `audit_log`: permission checks, Action Guard decisions, and sensitive boundaries.

## Event Type Checklist

- `task.created`
- `task.planned`
- `task.permission_requested`
- `task.started`
- `task.progress`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `agent.started`
- `agent.completed`
- `agent.failed`
- `checkpoint.created`
- `task.verifying`
- `task.completed`
- `task.failed`
- `runtime.heartbeat`

## UI Rules

Normal mode shows progress bubble and execution summary. Debug mode may show ids, duration, error code, event type, and sanitized payload shape. No mode displays hidden model reasoning, credentials, tokens, or raw secrets.

Do not implement a second observability stack. Existing chat/tool/collaboration events should be wrapped and normalized into the target schemas over time.

## Agent Heartbeat Rule

`agent_runs.status` is a lifecycle status only: `created`, `running`, `waiting_human`, `recovering`, `completed`, `failed`, `cancelled`, or `blocked`. Agent heartbeat is represented as `task_events.event_type = agent_heartbeat`, with the latest timestamp mirrored in `agent_runs.heartbeat_at`.
