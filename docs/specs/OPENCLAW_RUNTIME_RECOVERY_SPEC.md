# OpenClaw Runtime Recovery Spec

This spec defines the Hermes 1.0.7 OpenClaw recovery skeleton. It is a planning and governance document only. It does not change OpenClaw configuration, secrets, runtime files, gateway processes, or packaged assets.

## Scope

OpenClaw recovery must preserve the Hermes 1.0.7 baselines already committed for Link Reader, Collaboration / Watch Tasks, E-Commerce Ops, Generation / PPT, WeChat Customer Ops, Frontend Observability, Runtime Packaging, and Release Gates.

Recovery work must not create a second Agent Dispatcher, a second tool runtime, or a parallel OpenClaw integration path. All changes must be patch_existing or wrap_existing around the current gateway/runtime/adapter chain.

## Recovery Layers

### Gateway / Runtime

- Owns OpenClaw gateway startup, health checks, runtime path resolution, port ownership, provider/model availability, and gateway restart verification.
- Must not read old package paths or root runtime caches as delivery inputs.
- Must verify the runtime selected by Hermes is the intended OpenClaw runtime for the current branch.

### Agent / Tool Integration

- Owns OpenClaw agent capability exposure, tools.profile behavior, agent_runs emission, tool_runs mapping, and task_events compatibility.
- Must not bypass existing Hermes collaboration dispatch or adapter contracts.
- Must keep Hermes and Claude Code compatibility checks after any OpenClaw recovery.

### Security / Governance

- Owns token/secrets handling, profile restrictions, LAN exposure review, command ownership, and release gate eligibility.
- Codex must not directly repair or print OpenClaw secrets. Secret migration requires explicit human confirmation.
- tools.profile changes must happen after token/secrets migration, not before.

### Workspace Bootstrap

- Owns OpenClaw workspace template integrity, bootstrap file completeness, gateway owner files, runtime templates, and first-run checks.
- Truncated or incomplete bootstrap files are P0 until verified.

### Memory

- Owns memory directory presence, index availability, migration safety, and old-package memory exclusion.
- Memory recovery must not import unreviewed local user data into source-controlled deliverables.

### Skills / Channels / Node Service

- Owns skill setup noise, browser/channel configuration, node service availability, and optional capability enablement.
- Skill installation and OpenClaw update are not first-line fixes. They are deferred until core gateway/runtime/security checks pass.

### Hermes / Claude Compatibility

- Owns Hermes to OpenClaw dispatch, OpenClaw to Hermes result return, Claude Code panel compatibility, and shared observability records.
- Any OpenClaw fix must be followed by Hermes / Claude / OpenClaw compatibility verification.

## Required Recovery Order

1. token / secrets
   - Move or rebind OpenClaw gateway token and provider credentials into approved secret storage.
   - Do not print tokens in logs or docs.
   - Do not unlock broader tools.profile permissions while secrets are still exposed.

2. bootstrap threshold
   - Verify OpenClaw workspace bootstrap files are complete and not truncated.
   - Verify required runtime/template files exist before gateway restart.
   - Block recovery if bootstrap files cannot be trusted.

3. tools.profile default
   - Review current minimal profile restrictions only after secrets are safe.
   - Restore the minimum required tool capability set for Hermes 1.0.7 use cases.
   - Keep high-risk write/send/spend/publish actions behind Action Guard / permission checks.

4. gateway restart
   - Restart only through the approved gateway/runtime path.
   - Verify port ownership, health, provider/model visibility, and log redaction.
   - Do not use old package startup scripts as the main path.

5. memory index
   - Verify memory directory and index exist.
   - Rebuild or rebind memory only from reviewed runtime state.
   - Do not package local memory into portable EXE assets.

6. skill noise
   - Resolve skill needs-setup noise only after gateway/runtime/security are stable.
   - Do not install skills as a shortcut for missing runtime bootstrap.

7. update deferred
   - OpenClaw update is last.
   - Update only after current runtime is backed up, issue registry is reviewed, and Hermes / Claude compatibility checks are ready.

## Verification After Recovery

Run verification without exposing secrets:

- OpenClaw gateway health and runtime path check.
- Provider/model availability check.
- Hermes to OpenClaw collaboration dispatch.
- OpenClaw result return to Hermes inbox.
- Claude Code panel task receive / return path.
- `agent_runs`, `tool_runs`, and `task_events` compatibility checks.
- Runtime Packaging Gate and Release Gate checks.

## Non-Goals

- No OpenClaw config mutation in this document.
- No secret repair by Codex without human confirmation.
- No doctor --fix, update, skill installation, gateway restart, or config set as part of skeleton creation.
- No package, Tauri, runtime/data/secrets, or business source changes.
