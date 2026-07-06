# Hermes 1.0.7 Release Checklist

This checklist defines the first release gate baseline for `1.0.7/hermes协作任务`.

## Required Pre-Commit Gate

Run the release gate runner before submitting a release or baseline commit:

```bash
node scripts/check-release-gates.mjs
```

The gate must pass before release packaging work starts. Failed commands must be fixed or explicitly deferred in a follow-up audit before the commit is treated as releasable.

## Files That Must Not Be Accidentally Submitted

Do not include these paths in normal business-fix commits:

- `scripts/dev-api.js`, unless the task is an isolated Gateway / Runtime / Relay compatibility task.
- `package.json`
- `package-lock.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `runtime/data/secrets`
- `src-tauri/resources/data/**` user state or secrets
- `.env`
- `relay-config.json`
- `node_modules`
- `src-tauri/target`
- runtime caches, logs, auth files, sessions, memories, local databases, and generated package output.

Before committing, verify staged files explicitly:

```bash
git diff --cached --name-only
git status -sb
```

Do not use `git add .` for release-gated commits.

## Portable EXE Gate

Before U-drive portable EXE packaging:

- `node --test tests/contract/runtime-packaging-gate.test.js` must pass.
- `docs/registry/RUNTIME_MANIFEST.md` must be reviewed for runtime source, version, checksum, license, package path, and review status.
- Whole-directory `resources/data/**/*` packaging is forbidden.
- Root `data`, `uv-python`, and `uv-tools` must not be copied by legacy portable scripts.
- Real `.env`, key, token, cookie, relay config, auth state, logs, sessions, memories, local databases, and customer data must not enter deliverables.

## Implementation Rules

- Do not create a second implementation for an existing feature.
- All business fixes must use `patch_existing`, `wrap_existing`, or `extract_later`.
- Preserve existing public function signatures and UI-consumed fields unless a separate compatibility task approves the change.
- Adapter / wrapper additions must keep old entry points compatible while moving toward a single main path.
- Do not bypass existing Gateway, Adapter, collaboration, observability, or Action Guard boundaries.

## Eight Problem Regression Gate

Each of the eight Hermes 1.0.7 problem areas must have regression or contract coverage before release:

1. Link Reader
2. Collaboration / Watch Tasks
3. E-Commerce Ops
4. Generation / PPT
5. WeChat Customer Ops
6. Frontend Dialog / Progress Bubble / Debug Panel
7. Runtime / Packaging / Portable EXE
8. Regression Tests / Release Gates

The first release gate runner covers the current baseline regression, contract, and smoke checks. New business fixes should add or update tests in the same release-gated flow.
