# Provider Profile Migration Notes

This file records the internal model-provider structure used by the
Minimax providerization verification branch. It is for maintainers and
agents, not for customer-facing documentation.

## Goal

Keep user/auth/payment behavior separate from model-provider wiring.

The product should be able to switch default model providers by changing a
provider profile instead of hardcoding one provider across Hermes, OpenClaw,
and Claude Code.

## Current Verified Baseline

- Branch: `验证-minimax-provider化`
- Verification target: Minimax only
- User system: not merged
- yyapi: not merged as default provider yet
- Hermes: Minimax CN works through provider id `minimax-cn`
- OpenClaw: Minimax CN works through provider id `minimax_cn`
- Claude Code: Minimax CN works through an OpenAI-compatible relay profile

The important lesson from verification is that provider ids are not identical
across engines:

| Logical profile | Hermes provider | OpenClaw provider | Claude Code relay |
| --- | --- | --- | --- |
| `minimax-cn` | `minimax-cn` | `minimax_cn` | `openai-compatible` |
| `minimax` | `minimax` | `minimax` | `openai-compatible` |

Do not force all engines to use the same provider id string.

## Core Files

- `src/lib/model-provider-profiles.js`
  - Canonical provider profile registry.
  - Maps one logical profile to engine-specific provider ids.
  - Owns shared env var generation for Hermes/OpenClaw/Claude Code.

- `src/lib/minimax-test-config.js`
  - Frontend/apply path for Minimax test-provider mode.
  - Must call provider-profile helpers instead of hardcoding model/baseUrl.

- `scripts/dev-api.js`
  - Web/dev backend bridge.
  - Must normalize OpenClaw provider aliases before gateway startup.
  - Must not write raw keys into generated gateway launch config.

- `scripts/build-desktop-client.ps1`
  - Portable desktop packaging path.
  - Sanitized test builds should pass profile env such as
    `VITE_SUPERCLAW_MINIMAX_PROVIDER=minimax-cn`.

- `scripts/build-green-package.ps1`
  - Green/portable package path.
  - Must keep Hermes and launcher env aligned with provider profiles.

- `src-tauri/src/commands/hermes.rs`
  - Tauri Hermes config save path.
  - Minimax CN and international keys are written compatibly so Hermes can
    switch between `minimax` and `minimax-cn`.

## OpenClaw Provider Rule

OpenClaw CN provider id is `minimax_cn`, not `minimax-cn`.

The code must normalize old aliases:

- `minimax-cn/MiniMax-M3` -> `minimax_cn/MiniMax-M3`
- `models.providers["minimax-cn"]` -> `models.providers["minimax_cn"]`

When both aliases exist, keep the non-empty API key and a valid base URL.

## Hermes Provider Rule

Hermes CN provider id is `minimax-cn`.

When configuring Minimax CN, write both compatibility keys:

- `MINIMAX_CN_API_KEY`
- `MINIMAX_API_KEY`

And both base URL variables:

- `MINIMAX_CN_BASE_URL`
- `MINIMAX_BASE_URL`

This prevents cross-machine failures where one runtime looks for the other
variable.

## Dev Mode Rule

`npm run tauri:dev` uses `tauri dev --no-watch`.

Reason: Hermes/OpenClaw Python and runtime resources create cache files under
`src-tauri/resources/**`. Tauri's Rust watcher sees those cache writes and can
rebuild forever. Use `npm run tauri:dev:watch` only when specifically working
on Rust hot reload.

## yyapi Merge Plan

When merging user system and yyapi back in, keep the provider architecture:

1. Add a `yyapi` provider profile to `src/lib/model-provider-profiles.js`.
2. Make yyapi the release/default profile only when user system is enabled.
3. Keep Minimax as a selectable profile, not as hardcoded test logic.
4. Do not remove Minimax profile support when yyapi becomes default.
5. Preserve user-editable providers for OpenClaw and Claude Code.
6. Preserve Hermes yyapi base URL lock if required by product policy.
7. Keep auth/login/register/payment changes separate from provider-profile
   changes when resolving conflicts.

Known source commits for the auth/yyapi kit:

- `518ed942` - `feat: extract auth yyapi kit phase 1`
  - `scripts/dev-api.js`
  - `scripts/lib/model-config-source-guard.mjs`
  - `scripts/lib/runtime-mode.mjs`
  - `scripts/lib/yyapi-config.mjs`
  - `scripts/smoke-auth-yyapi-kit-phase1.mjs`
- `f850ee5f` - `feat: add auth yyapi kit phase 2`
  - `scripts/dev-api.js`
  - `scripts/lib/auth-guard.mjs`
  - `scripts/lib/auth-session.mjs`
  - `scripts/smoke-auth-yyapi-kit-phase2.mjs`
  - `src/lib/auth-session.js`
  - `src/main.js`
  - `src/pages/activate.js`
  - `src/pages/login.js`
  - `src/pages/register.js`

Do not directly merge `origin/1.0.3-auth-yyapi-kit` into the current branch.
That branch is based on an older integration point and can delete or revert
newer OpenClaw/Hermes/Claude Code stability files. Prefer a selective
cherry-pick or file-level transplant of the two commits above.

Recommended merge order:

1. Import `scripts/lib/runtime-mode.mjs` and `scripts/lib/yyapi-config.mjs`.
2. Adapt the `scripts/dev-api.js` hunks manually, preserving provider profiles.
3. Import auth/session helpers and pages.
4. Wire routes/main entry points for login/register/activate.
5. Add a `yyapi` profile to `src/lib/model-provider-profiles.js`.
6. Make release mode use `yyapi` as default profile.
7. Keep Minimax profile selectable for test builds and provider verification.
8. Run both auth/yyapi smoke tests and provider smoke tests.

Suggested default behavior:

| Build mode | Default provider | User system |
| --- | --- | --- |
| Test/provider verification | `minimax-cn` | disabled |
| Customer release | `yyapi` | enabled |
| Developer override | env/localStorage profile | configurable |

## Required Checks After Merge

Run these before packaging:

```powershell
node scripts/smoke-provider-profile-minimax.mjs
node scripts/smoke-openclaw-model-config.mjs
node scripts/smoke-openclaw-gateway-start-chain.mjs
node scripts/smoke-openclaw-source-scope.mjs
node scripts/smoke-openclaw-minimax-key-test-entry.mjs
npm run build
```

Also verify manually:

- Hermes can start gateway and chat.
- OpenClaw can start gateway and chat.
- Claude Code panel can start and chat.
- No real API key appears in `git diff`.
- No `.env`, user session, logs, or cache files are packaged into final builds.
