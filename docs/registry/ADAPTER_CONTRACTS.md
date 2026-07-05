# Adapter Contracts

This file defines contracts only. It does not implement adapters.

## Common Contract Fields

Every adapter contract must define input, output, required events, required logs, timeout, error format, permission check, and audit requirements.

## OpenClaw Adapter Contract

- Input: task intent, target surface, allowed actions, permission level.
- Output: observation, action result, evidence, error summary.
- Required events: `agent.started`, `agent.completed` or `agent.failed`, related `task.progress`.
- Required logs: sanitized action and observation summary.
- Timeout: task-defined with watchdog.
- Error format: code, message, retryability, evidence.
- Permission check: L2 before write, publish, spend, send, price, list, delist.
- Audit requirements: record Action Guard decision.

## Claude Code Adapter Contract

- Input: engineering question, file scope, allowed operation class.
- Output: analysis, patch proposal, test recommendation, risk list.
- Required events: `agent.started`, `agent.completed` or `agent.failed`.
- Required logs: sanitized summary only.
- Timeout: task-defined.
- Error format: code, message, recovery recommendation.
- Permission check: L2 before file modification tasks.
- Audit requirements: record scope and changed files when applicable.

## Codex Adapter Contract

- Input: task brief, repository scope, allowed file operation class.
- Output: implementation summary, verification result, risk list.
- Required events: `agent.started`, `agent.completed` or `agent.failed`.
- Required logs: sanitized execution summary.
- Timeout: task-defined.
- Error format: code, message, blocked reason.
- Permission check: L2 before code or config changes.
- Audit requirements: record file classes touched.

## Tool Adapter Contract

- Input: tool name, arguments, permission level, timeout.
- Output: stdout/stderr summary or structured result.
- Required events: `tool.started`, `tool.completed` or `tool.failed`.
- Required logs: sanitized command or operation summary.
- Timeout: required.
- Error format: code, message, exit status, retryability.
- Permission check: L2 for state-changing tools.
- Audit requirements: record sanitized arguments and result.

## Platform Adapter Contract

- Input: platform, operation, payload, permission level.
- Output: platform result, ids, evidence, error summary.
- Required events: `tool.started`, `tool.completed` or `tool.failed`.
- Required logs: sanitized platform action summary.
- Timeout: operation-defined.
- Error format: code, provider message summary, retryability.
- Permission check: L2 for write, publish, send, spend, price, list, delist.
- Audit requirements: record approval and provider operation class.

## Model Adapter Contract

- Input: model goal, prompt intent, style, constraints, acceptance criteria.
- Output: normalized prompt, generation result metadata, validation summary.
- Required events: `tool.started`, `tool.completed` or `tool.failed`.
- Required logs: sanitized prompt summary, not hidden reasoning.
- Timeout: provider-defined.
- Error format: code, provider class, retryability.
- Permission check: L2 for paid or external persistent generation.
- Audit requirements: record provider class and cost/action approval class.

## Observability Requirements for Adapters

- OpenClaw Adapter must emit `agent_runs` and `agent_heartbeat` events.
- Claude Code Adapter must emit `agent_runs` and task result events.
- Tool Adapter must emit `tool_runs`.
- Platform Adapter must emit `tool_runs`.
- Model Adapter must emit `tool_runs`.
- All Adapters must map visible progress into `task_events`.
- No Adapter may bypass `task_events`; adapter-specific logs are supplemental, not a replacement for the shared observability contract.
- Event field names and visibility rules must follow `docs/specs/OBSERVABILITY_SCHEMA_CONTRACT.md`.
