# OpenClaw Issue Registry

This registry tracks known OpenClaw runtime recovery issues for Hermes 1.0.7. It is a planning artifact only and contains no secrets.

| issue_id | issue | layer | risk_level | blocks_8_issues | evidence | repair_method | human_confirmation | rollback_method | verification_command |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OC-P0-001 | tools.profile minimal disables required tools | Agent / Tool Integration, Security / Governance | P0 | yes, blocks Collaboration, Generation, WeChat, and deeper Frontend Observability signals | Reported OpenClaw red code: minimal profile forbids many tools | Current runtime allows only `minimal`, `coding`, `messaging`, and `full`. Use `coding` first for local development recovery; reserve `full` for trusted operator-controlled recovery after explicit confirmation. Keep high-risk actions behind Action Guard. | yes | Restore previous reviewed profile snapshot | `openclaw doctor` or approved profile inspection command, then Hermes/OpenClaw smoke checks |
| OC-P0-002 | gateway token appears as plaintext risk | Security / Governance, Gateway / Runtime | P0 | yes, blocks safe gateway recovery and profile unlock | Reported red code: gateway token plaintext | Move token to approved secret storage and redact logs before other recovery | yes | Restore previous secret binding from secure backup | Approved gateway health command with redacted output |
| OC-P0-003 | bootstrap file truncated | Workspace Bootstrap, Gateway / Runtime | P0 | yes, can break OpenClaw startup and workspace readiness | Reported red code: bootstrap truncation | Verify bootstrap template from clean source and replace only after review | yes | Restore previous reviewed bootstrap/template snapshot | Approved bootstrap integrity check and OpenClaw startup health |
| OC-P0-004 | memory directory missing or index empty | Memory, Workspace Bootstrap | P0 | partial, blocks memory-dependent OpenClaw workflows | Reported red code: memory missing/index empty | Recreate or rebind memory index from reviewed runtime state, not from local package debris | yes | Restore previous reviewed memory metadata | Approved memory index status command |
| OC-P1-001 | shell escaping hazards | Security / Governance, Gateway / Runtime | P1 | partial, can break scripted recovery | Reported red code: shell escaping issue | Use approved PowerShell-native commands and quoted paths | no, unless secrets involved | Revert script command changes | Targeted command dry-run or no-op validation |
| OC-P1-002 | skill needs setup noise | Skills / Channels / Node Service | P1 | no for baselines, partial for advanced OpenClaw features | Reported red code: skill setup noise | Defer skill setup until gateway/security/bootstrap pass | yes before installing skills | Remove newly installed skill/config if introduced | Approved skill status inspection |
| OC-P1-003 | channels not configured | Skills / Channels / Node Service | P1 | partial, may affect browser/channel capability | Reported red code: channels missing | Configure only required channels after runtime is stable | yes | Restore previous channel config | Approved channel status check |
| OC-P1-004 | node service not installed | Skills / Channels / Node Service | P1 | partial, affects node-backed OpenClaw capabilities | Reported red code: node service missing | Install or bind service only through approved runtime setup | yes | Uninstall/revert service registration | Approved node service health check |
| OC-P2-001 | browser channel incomplete | Skills / Channels / Node Service | P2 | no for current baselines, may affect browser automation | Reported red code: browser channel | Defer until P0/P1 fixed | yes if installing/configuring | Restore previous channel config | Browser channel health check |
| OC-P2-002 | TaskFlow has zero instances | Agent / Tool Integration | P2 | partial, affects long-running orchestration | Reported red code: TaskFlow 0 instances | Verify expected taskflow runtime after gateway recovery | no | Revert taskflow config change | TaskFlow status check |
| OC-P2-003 | OpenClaw update pending | Gateway / Runtime, Security / Governance | P2 | no immediate block, but may affect future compatibility | Reported red code: update | Defer update until after current recovery and compatibility checks | yes | Restore previous OpenClaw runtime version | Version check and rollback smoke |
| OC-P2-004 | command-owner unclear | Gateway / Runtime, Security / Governance | P2 | partial, can affect process ownership and restarts | Reported red code: command-owner | Verify owner file/process ownership before restart | no | Restore previous owner marker | Gateway owner inspection |
| OC-P2-005 | LAN IP exposure | Security / Governance, Gateway / Runtime | P2 | partial, security risk if gateway binds broadly | Reported red code: LAN IP exposure | Verify bind host and firewall/scope before enabling external access | yes | Rebind to localhost or reviewed interface | Gateway bind/health inspection with redacted output |

## Blocking Rules

- P0 issues must be resolved before OpenClaw capability expansion.
- Gateway token/secrets repair remains a release blocker and must be handled with human confirmation; Codex must not directly repair or print secrets.
- Bootstrap integrity must be verified before gateway restart; bootstrap truncation is considered fixed only after `doctor --lint` reports no bootstrap truncation warnings.
- Profile recovery should prefer `coding` first. `minimal` is too narrow, `messaging` is not suitable for development repair, and `full` is high risk while token/secrets migration is deferred.
- OpenClaw update must remain deferred until P0/P1 recovery is complete.

## Compatibility Rules

- OpenClaw recovery must not modify Hermes 1.0.7 business baselines without a specific task.
- OpenClaw recovery must not modify `scripts/dev-api.js` unless the task is explicitly scoped as a gateway compatibility fix.
- OpenClaw recovery must be followed by Hermes / Claude / OpenClaw compatibility checks.
