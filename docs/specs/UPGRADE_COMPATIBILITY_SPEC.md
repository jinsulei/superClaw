# Upgrade Compatibility Spec

## Upgrade Scope

OpenClaw, Hermes, Claude Code, Codex, platform APIs, and generation models may change independently. Business code must stay protected by adapters and contracts.

Upgrade compatibility belongs primarily to Layer 8 Tests / Release Gates, with dependencies on Layer 1 Runtime / Packaging and Layer 4 Agent / Tool Integration.

## Compatibility Principles

- Business modules depend on adapter contracts, not concrete external agent versions.
- Capability Registry declares what each provider can do and what risk level applies.
- Adapter Contract Tests verify input, output, events, logs, timeout, error format, permission checks, and audit requirements.
- Regression Tests cover the eight Hermes 1.0.7 function domains.
- Feature Flags isolate risky or provider-specific behavior.
- Rollback Plan defines how to disable a capability or revert to a previous adapter path.

## Prohibition

Do not let business modules directly import, call, or depend on external agent version-specific APIs. All such access must pass through Gateway, Adapter, and Task Framework boundaries.
