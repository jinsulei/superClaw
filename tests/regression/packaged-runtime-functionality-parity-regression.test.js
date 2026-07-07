import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { compactHermesHistoryContentForPrompt } from '../../src/engines/hermes/lib/chat-store.js'

const hermesStoreSource = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const openclawCommandsSource = readFileSync('src-tauri/src/commands/mod.rs', 'utf8')
const claudeCommandsSource = readFileSync('src-tauri/src/commands/claude_code.rs', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')

test('Hermes packaged chat history does not replay previous long assistant replies', () => {
  const previousAssistant = [
    'OLD_ASSISTANT_REPLY_SHOULD_NOT_BE_REPLAYED',
    'x'.repeat(1200),
  ].join('\n')
  const compacted = compactHermesHistoryContentForPrompt('assistant', previousAssistant)

  assert.match(compacted, /previous assistant response omitted to avoid replay/)
  assert.match(compacted, /\(\d+ chars\)/)
  assert.equal(compacted.includes('OLD_ASSISTANT_REPLY_SHOULD_NOT_BE_REPLAYED'), false)
  assert.ok(compacted.length < 120, 'compacted assistant history should stay small')
})

test('Hermes keeps short assistant history and user context intact', () => {
  assert.equal(compactHermesHistoryContentForPrompt('assistant', '短回复'), '短回复')

  const userContext = '请继续围绕这个商品标题优化，不要改变品牌名。' + ' 用户补充'.repeat(100)
  assert.equal(compactHermesHistoryContentForPrompt('user', userContext), userContext)
})

test('OpenClaw portable first-run fills missing gateway auth token in runtime config', () => {
  assert.match(openclawCommandsSource, /fn\s+new_portable_gateway_token\(\)\s*->\s*String/)
  assert.match(openclawCommandsSource, /PORTABLE_GATEWAY_TOKEN_PREFIX/)
  assert.match(openclawCommandsSource, /is_placeholder_or_legacy_gateway_token\(current_auth_token\.as_deref\(\)\)/)
  assert.match(openclawCommandsSource, /auth\.insert\("token"\.into\(\),\s*serde_json::json!\(token\.clone\(\)\)\)/)
  assert.match(openclawCommandsSource, /"remote"\.into\(\),\s*serde_json::json!\(\{\s*"token":\s*portable_gateway_token\s*\}\)/)
  assert.match(openclawCommandsSource, /"profile":\s*OPENCLAW_EFFECTIVE_TOOLS_PROFILE/)
})

test('OpenClaw portable runtime token is generated on first run, not embedded as the old fixed token', () => {
  const configRepairBlock = openclawCommandsSource.match(/fn ensure_portable_openclaw_config[\s\S]*?fn ensure_portable_device_identity/)?.[0] || ''
  assert.equal(configRepairBlock.includes('"superclaw-portable-local"'), false)
  assert.match(openclawCommandsSource, /rand::thread_rng\(\)[\s\S]*sample_iter\(&rand::distributions::Alphanumeric\)/)
})

test('ClaudeCode packaged panel resolves native CLI path or explicitly allows relay fallback', () => {
  assert.match(claudeCommandsSource, /fn\s+effective_claude_cli_path\(resources:\s*&Path\)\s*->\s*PathBuf/)
  assert.match(claudeCommandsSource, /claude\.cmd/)
  assert.match(claudeCommandsSource, /windows_npm_global_prefix/)
  assert.match(claudeCommandsSource, /CLAUDE_CLI_PATH",\s*effective_claude/)
  assert.match(claudeCommandsSource, /CLAUDE_PANEL_ALLOW_RELAY_FALLBACK",\s*"1"/)
  assert.doesNotMatch(claudeCommandsSource, /CLAUDE_PANEL_NATIVE_REQUIRED",\s*"1"/)
})

test('packaged runtime parity regression is release-gated and avoids forbidden edits', () => {
  assert.match(
    releaseGateSource,
    /node',\s*'--test',\s*'tests\/regression\/packaged-runtime-functionality-parity-regression\.test\.js'/,
  )

  for (const source of [hermesStoreSource, openclawCommandsSource, claudeCommandsSource]) {
    assert.equal(source.includes('G:\\SuperClaw_USB_1.0.7'), false)
    assert.equal(source.includes('models.providers.minimax.apiKey'), false)
  }
})
