# Task Framework Spec

## Task Object Fields

| Field | Purpose |
| --- | --- |
| `task_id` | Stable identifier for a task instance. |
| `task_type` | Domain-specific task category. |
| `status` | Current lifecycle state. |
| `permission_level` | `L1` or `L2`. |
| `execution_topology` | Which agents/tools participate. |
| `task_weight` | `light` or `heavy`. |
| `success_criteria` | Observable acceptance criteria. |
| `final_judgment_by` | Must be `Hermes`. |

## Task Types

Initial task families are `link_reader`, `collaboration_watch`, `ecommerce_ops`, `wechat_customer_ops`, `generation_ppt`, `observability`, `runtime_upgrade`, and `governance`.

## Execution Topology

- `hermes_only`
- `hermes_tool`
- `hermes_openclaw`
- `hermes_claude`
- `hermes_openclaw_claude`
- `hermes_platform_api`

## Status State Machine

`created -> planned -> awaiting_permission -> running -> verifying -> completed`

Failure and pause states: `blocked`, `failed`, `cancelled`, `checkpointed`, `resumed`.

## Permission Levels

- `L1`: read, draft, summarize, classify, plan, recommend.
- `L2`: write, publish, send, spend, change price, list or delist products, modify external systems.

## Verification

Every task declares `success_criteria`. Hermes performs final verification and emits the user-facing result. Tools and agents may provide evidence, but they do not replace Hermes final judgment.
