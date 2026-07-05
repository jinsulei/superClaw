# Observability Schema Contract

This contract defines the Hermes 1.0.7 observability event schemas. It is documentation only. It does not create a new event system, UI, runtime, or implementation path.

## Goal

Current Observability is partial, not a unified event model. The first target is to wrap existing execution traces into one contract before changing UI.

Existing sources that must be wrapped:

- `src/lib/collaboration.js`: local task messages.
- `src/engines/hermes/pages/chat.js`: tool debug row and `renderLiveTools`.
- `src/engines/hermes/lib/chat-store.js`: stream messages.
- `src/lib/ws-client.js`: heartbeat.
- `src/lib/agent-gateway-status.js`: agent status.
- `src-tauri/src/commands/hermes.rs`: guardian/status events.
- `src-tauri/src/commands/service.rs`: service/agent status events.
- `src/shared/ecommerce-stage*`: confirmation and risk events.
- `scripts/dev-api.js`: dev API status, stream, relay, health, and runtime events.

Version 1 defines schemas. It must not rewrite chat, split `scripts/dev-api.js`, or create a second task/collaboration system.

## Core Schemas

### task_events

| Field | Required | Description |
| --- | --- | --- |
| `event_id` | yes | Unique event id. |
| `task_id` | yes | Stable task id. |
| `task_type` | yes | Domain task type, such as `collaboration`, `link_reader`, `ecommerce`, or `generation`. |
| `event_type` | yes | One value from the standard event type list. |
| `actor` | yes | Actor that produced the event: `user`, `hermes`, `openclaw`, `claude_code`, `codex`, `tool`, `gateway`, `runtime`, or `system`. |
| `source` | yes | Source path or subsystem, for example `collaboration.local_message` or `hermes.stream`. |
| `status` | no | Current task state if known. |
| `visible_text` | no | Sanitized user-visible summary. |
| `raw_payload` | no | Sanitized original payload shape or selected safe fields. |
| `visibility` | yes | `normal`, `debug`, `audit_only`, or `hidden_sensitive`. |
| `severity` | yes | `info`, `warning`, `error`, or `critical`. |
| `linked_tool_run_id` | no | Related `tool_runs.tool_run_id`. |
| `linked_agent_run_id` | no | Related `agent_runs.agent_run_id`. |
| `created_at` | yes | ISO timestamp. |

### tool_runs

| Field | Required | Description |
| --- | --- | --- |
| `tool_run_id` | yes | Unique tool run id. |
| `task_id` | yes | Parent task id. |
| `tool_name` | yes | Normalized tool name. |
| `provider` | no | Tool provider or bridge, such as `hermes`, `openclaw`, `platform`, `model`, or `local`. |
| `status` | yes | `started`, `running`, `completed`, `failed`, or `cancelled`. |
| `input_summary` | no | Sanitized input summary. |
| `output_summary` | no | Sanitized output summary. |
| `error_code` | no | Stable error code if failed. |
| `error_message` | no | Sanitized error message. |
| `duration_ms` | no | Duration in milliseconds. |
| `started_at` | yes | ISO timestamp. |
| `completed_at` | no | ISO timestamp. |
| `audit_ref` | no | Reference to audit log entry when needed. |

### agent_runs

| Field | Required | Description |
| --- | --- | --- |
| `agent_run_id` | yes | Unique agent run id. |
| `task_id` | yes | Parent task id. |
| `agent_name` | yes | `hermes`, `openclaw`, `claude_code`, `codex`, or future normalized agent name. |
| `adapter_name` | yes | Adapter or bridge name. Use current bridge name until a real Adapter exists. |
| `status` | yes | Lifecycle state: `created`, `running`, `waiting_human`, `recovering`, `completed`, `failed`, `cancelled`, or `blocked`. Do not use event names such as `agent_heartbeat`, `tool_call_started`, or `task_progress` here. |
| `current_step` | no | Sanitized current step. |
| `heartbeat_at` | no | Latest heartbeat ISO timestamp. |
| `checkpoint_id` | no | Checkpoint id if resumable. |
| `resume_supported` | yes | Boolean. |
| `error_code` | no | Stable error code if failed. |
| `error_message` | no | Sanitized error message. |
| `started_at` | yes | ISO timestamp. |
| `completed_at` | no | ISO timestamp. |

## Standard event_type Values

- `user_message`
- `task_created`
- `task_planned`
- `task_started`
- `task_progress`
- `task_waiting_human`
- `task_recovering`
- `task_completed`
- `task_failed`
- `tool_call_started`
- `tool_call_completed`
- `tool_call_failed`
- `agent_command_sent`
- `agent_status_update`
- `agent_heartbeat`
- `agent_checkpoint_saved`
- `agent_resume_requested`
- `agent_resume_completed`
- `permission_checked`
- `action_guard_blocked`
- `approval_required`
- `approval_granted`
- `approval_rejected`
- `audit_recorded`

## visibility Rules

| visibility | Rule |
| --- | --- |
| `normal` | Visible to normal users as execution summary, progress, status, or result. |
| `debug` | Visible only in debug mode; may include `tool_run_id`, `agent_run_id`, `duration_ms`, `error_code`, and sanitized payload shape. |
| `audit_only` | Written to audit log only; not shown in the normal dialog. |
| `hidden_sensitive` | Must not be rendered. Use only to mark redacted sensitive source fields. |

Do not display hidden model reasoning. Do not display secrets. Do not display complete tokens or cookies. Only display execution trajectory, status, summaries, and sanitized error reasons.

## Agent Heartbeat Rule

Agent heartbeat is an event, not an agent lifecycle status. Emit heartbeat through `task_events.event_type = agent_heartbeat`, update `agent_runs.heartbeat_at`, and keep `agent_runs.status` as a lifecycle state such as `running`.

## Existing Implementation Mapping

| Existing path | Current content | Schema mapping | migration_rule | Risk |
| --- | --- | --- | --- | --- |
| `src/lib/collaboration.js` | Local task messages, pending dispatch, shared memory entries. | `task_events`, partial `agent_runs` | wrap_existing; no_parallel_impl | high |
| `src/engines/hermes/pages/chat.js` | Tool debug row, `renderLiveTools`, collaboration dispatch, ecommerce event rendering. | `task_events`, `tool_runs`, `agent_runs` summaries | wrap_existing; no_parallel_impl | high |
| `src/engines/hermes/lib/chat-store.js` | Hermes stream messages, live tools, assistant message normalization. | `task_events`, `tool_runs` | wrap_existing; no_parallel_impl | high |
| `src/lib/ws-client.js` | WebSocket status and heartbeat. | `task_events`, `agent_runs.heartbeat_at` | wrap_existing | medium |
| `src/lib/agent-gateway-status.js` | Agent status, readiness, model setup status. | `agent_runs`, `task_events` status updates | wrap_existing | medium |
| `src-tauri/src/commands/hermes.rs` | Hermes guardian, gateway, run, tool, install/status events. | `agent_runs`, `tool_runs`, `task_events`, audit refs | wrap_existing; extract_later | high |
| `src-tauri/src/commands/service.rs` | OpenClaw service guardian and gateway owner/status events. | `agent_runs`, `task_events`, audit refs | wrap_existing; extract_later | high |
| `src/shared/ecommerce-stage*` | Confirmation, risk, stage runner events. | `task_events`, `tool_runs`, approval/action guard events | patch_existing; no_parallel_impl | high |
| `scripts/dev-api.js` | Dev routes, Hermes stream, OpenClaw health, Claude relay, runtime status. | `task_events`, `tool_runs`, `agent_runs` | wrap_existing; extract_later; no_parallel_impl | high |

## Version 1 Adoption Strategy

1. Schema first, UI later.
2. Wrap existing messages and debug rows; do not rewrite chat.
3. Wrap `src/lib/collaboration.js` local task messages first.
4. Wrap Hermes stream and `liveTools`.
5. Wrap agent heartbeat and status.
6. Do not split `scripts/dev-api.js` in the first version.
7. Do not create a second task or collaboration system.
8. All later business feature fixes must emit or map into `task_events`, `tool_runs`, and `agent_runs`.

## Acceptance Criteria for Future Code

- Creating a task emits `task_created`.
- Calling a tool emits `tool_call_started` and then `tool_call_completed` or `tool_call_failed`.
- Calling OpenClaw, Claude Code, Hermes, or Codex emits an `agent_runs` record.
- Long-running agent work emits heartbeat updates.
- Action Guard blocks emit `action_guard_blocked`.
- Human confirmation requirements emit `approval_required`.
- Granted confirmation emits `approval_granted`; rejected confirmation emits `approval_rejected`.
- Normal UI can display a progress summary from `task_events`.
- Debug UI can display `tool_run_id` and `agent_run_id`.
- Sensitive fields are redacted before display or persistence.
- Existing chat rendering is not broken.
- No parallel collaboration implementation is created.
