# Agent Capability Registry

This registry records Hermes 1.0.7 agent capability boundaries. It does not implement adapters, change secrets, or enable tools.

| agent | current_state | tool_capability | available_now | disabled_by_tools_profile | needs_token | impacts_8_issues | impacts_portable_exe | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hermes | partial | Chat orchestration, Link Reader normalization, collaboration task messages, ecommerce/generation/wechat guards, observability view models | yes | no | provider-dependent | all 8 issues | yes, Hermes runtime must remain portable-safe | Hermes is the coordinator and must not be bypassed by direct business-to-agent calls |
| OpenClaw | partial / impaired | Browser/tool execution, visual/OCR workflows, generation execution, WeChat/window operations, ecommerce automation support | not fully reliable until recovery | likely yes, pending tools.profile review | yes | Collaboration, Generation / PPT, WeChat, E-Commerce, Frontend Observability, Runtime Packaging | yes, runtime and workspace must be manifest-reviewed | OpenClaw configuration repair requires human confirmation |
| Claude Code | partial | Code/engineering panel, delegated technical tasks, result return to Hermes | yes, with current panel constraints | no known profile block in this registry | possibly, depending relay/provider | Collaboration / Watch Tasks, Engineering workflows | yes, claude-panel runtime must be reviewed | Must remain compatible after OpenClaw recovery |
| Codex | reserved / planned adapter boundary | Repository work through this Codex environment, not a production runtime adapter | yes as development assistant, not as app runtime adapter | no | no direct OpenClaw secret access | Governance, tests, docs, code repair | no direct app runtime asset unless explicitly packaged | Codex must not directly repair OpenClaw secrets or create parallel runtime paths |

## Mandatory Boundaries

- Codex does not directly repair OpenClaw secrets.
- OpenClaw configuration repair requires human confirmation.
- tools.profile unlock must happen only after token/secrets migration.
- OpenClaw recovery must not affect the committed Hermes 1.0.7 baselines for the 8 issues.
- Business modules must not directly call OpenClaw, Claude Code, or Codex; they must converge through Agent Dispatcher / adapter contracts over time.
- OpenClaw update is deferred until security, bootstrap, gateway, memory, and compatibility checks pass.

## Eight-Issue Impact Matrix

| issue_area | Hermes | OpenClaw | Claude Code | Codex |
| --- | --- | --- | --- | --- |
| Link Reader | coordinator and UI chat path | optional downstream analysis/execution | no direct dependency | development/test support |
| Collaboration / Watch Tasks | task creation, pending dispatch, task_events | task receiver/executor, heartbeat/status | task receiver/return path | development/test support |
| E-Commerce Ops | Action Guard and stage orchestration | visual/tool automation support | optional analysis | development/test support |
| Generation / PPT | prompt/model normalization and result acceptance | model/tool execution path | optional technical assist | development/test support |
| WeChat Customer Ops | draft-only guard and customer normalization | OCR/window/exec support | optional analysis | development/test support |
| Frontend Observability | view model and UI presentation | source of agent/tool status | source of agent/task status | development/test support |
| Runtime / Portable EXE | packaged coordinator runtime | packaged OpenClaw runtime/workspace | packaged Claude panel runtime | no direct production runtime |
| Regression / Release Gates | test and governance target | needs future OpenClaw runtime gate | compatibility smoke target | test authoring support |

## Post-Recovery Compatibility Checks

After OpenClaw recovery, verify:

- Hermes gateway health.
- OpenClaw gateway health and runtime path.
- Hermes to OpenClaw dispatch.
- OpenClaw result return to Hermes.
- Claude Code panel receive and return path.
- `agent_runs`, `tool_runs`, and `task_events` compatibility.
- Runtime Packaging Gate and Release Gate.
