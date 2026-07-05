# Runtime Packaging Spec

## Layer

Runtime / Packaging is Layer 1. It defines the delivery boundary before broad business feature development.

## Portable EXE Goal

The portable desktop delivery must be able to run from a USB-style package without requiring the customer to install Hermes, OpenClaw, Claude Code, Codex, Python, Node, or other bundled runtime dependencies separately.

## Required Boundaries

- Runtime assets: reviewed files intended for packaging.
- Sidecar / external binary: declared and audited before packaging.
- Local data directory: user data, caches, logs, and generated state must live outside source-controlled delivery content.
- Secret exclusion: no real key, token, secret, relay config, session, or customer data enters deliverables.
- Old/wrong package exclusion: stale packages and incorrect runtime versions must be excluded.
- Dev runtime vs packaged runtime: dev-only caches and local state are not package inputs.

Runtime, data, and secrets boundaries must be defined before business modules start relying on new runtime behavior. Packaging whitelist, old/wrong package exclusion, and secret exclusion are release gates, not optional cleanup.

## Audit Checklist

- Review Tauri resources and bundle settings before packaging.
- Review sidecars and external binaries before packaging.
- Verify ignored runtime/data directories are not accidentally included.
- Verify no real `.env`, token, key, relay config, session, or local customer data is included.
- Verify OpenClaw, Hermes, Claude Code, and Codex capability compatibility through adapter contracts and tests.
