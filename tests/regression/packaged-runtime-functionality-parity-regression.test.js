import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { compactHermesHistoryContentForPrompt } from '../../src/engines/hermes/lib/chat-store.js'

const hermesStoreSource = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const openclawChatSource = readFileSync('src/pages/chat.js', 'utf8')
const openclawCommandsSource = readFileSync('src-tauri/src/commands/mod.rs', 'utf8')
const openclawDeviceSource = readFileSync('src-tauri/src/commands/device.rs', 'utf8')
const claudeCommandsSource = readFileSync('src-tauri/src/commands/claude_code.rs', 'utf8')
const claudePanelSource = readFileSync('src-tauri/resources/runtime/claude-panel/public/app.js', 'utf8')
const buildDesktopSource = readFileSync('scripts/build-desktop-client.ps1', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')

test('Hermes packaged chat history does not replay previous long assistant replies', () => {
  const previousAssistant = [
    'OLD_ASSISTANT_REPLY_SHOULD_NOT_BE_REPLAYED',
    'x'.repeat(1200),
  ].join('\n')
  const compacted = compactHermesHistoryContentForPrompt('assistant', previousAssistant)

  assert.equal(compacted, '')
  assert.equal(compacted.includes('OLD_ASSISTANT_REPLY_SHOULD_NOT_BE_REPLAYED'), false)
  assert.equal(compacted.includes('previous assistant response omitted to avoid replay'), false)
})

test('Hermes omits old assistant history even when the previous reply is short', () => {
  const contaminated = compactHermesHistoryContentForPrompt('assistant', '聂总，上一轮完整回复不应该进入下一轮 prompt')

  assert.equal(contaminated, '')
  assert.equal(contaminated.includes('previous assistant response omitted to avoid replay'), false)
  assert.equal(contaminated.includes('聂总'), false)
  assert.equal(contaminated.includes('上一轮完整回复'), false)
})

test('Hermes keeps user context intact while omitting assistant history', () => {
  const userContext = '请继续围绕这个商品标题优化，不要改变品牌名。' + ' 用户补充'.repeat(100)
  assert.equal(compactHermesHistoryContentForPrompt('user', userContext), userContext)
})

test('Hermes packaged long-task requests cannot complete with promise-only text', () => {
  assert.match(hermesStoreSource, /function\s+isHermesLongTaskRequest\(/)
  assert.match(hermesStoreSource, /function\s+isHermesPromiseOnlyLongTaskReply\(/)
  assert.match(hermesStoreSource, /function\s+hasHermesExecutionEvidence\(/)
  assert.match(hermesStoreSource, /function\s+buildHermesLongTaskUnavailableReply\(/)

  const doneBlock = hermesStoreSource.match(/tauriListen\('hermes-run-done'[\s\S]*?cleanupAfterRun\(\{ status: 'success', reason: 'run-completed' \}\)/)?.[0] || ''
  assert.match(doneBlock, /isHermesLongTaskRequest\(currentVisibleUserPrompt\(\)\)/)
  assert.match(doneBlock, /isHermesPromiseOnlyLongTaskReply\(msg\.content\)/)
  assert.match(doneBlock, /hasHermesExecutionEvidence\(/)
  assert.match(doneBlock, /buildHermesLongTaskUnavailableReply\(currentVisibleUserPrompt\(\)\)/)
})

test('Hermes long-task guard keeps short-answer prompts untouched', () => {
  assert.match(hermesStoreSource, /\\u53ea\\u56de\\u590d/)
  assert.match(hermesStoreSource, /\\u4e24\\u4e2a\\u5b57/)
  assert.match(hermesStoreSource, /return false[\s\S]*?isHermesLongTaskRequest/)
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

test('OpenClaw packaged release config does not enable insecure control UI auth', () => {
  const packagedTemplateBlock = buildDesktopSource.match(/gateway = \[ordered\]@\{[\s\S]*?Write-Utf8NoBom \(Join-Path \$OpenClawDataDir "openclaw\.json"\)/)?.[0] || ''
  const portableRepairBlock = openclawCommandsSource.match(/fn ensure_portable_openclaw_config[\s\S]*?fn ensure_portable_device_identity/)?.[0] || ''

  assert.doesNotMatch(packagedTemplateBlock, /allowInsecureAuth\s*=\s*\$true/)
  assert.doesNotMatch(portableRepairBlock, /"allowInsecureAuth":\s*true/)
  assert.match(packagedTemplateBlock, /allowInsecureAuth\s*=\s*\$false/)
})

test('OpenClaw packaged connect frame uses gateway-compatible device metadata', () => {
  const createFrameBlock = openclawDeviceSource.match(/pub fn create_connect_frame[\s\S]*?Ok\(frame\)\s*\}/)?.[0] || ''

  assert.match(createFrameBlock, /let\s+platform\s*=\s*gateway_cli_probe_platform\(\);/)
  assert.doesNotMatch(createFrameBlock, /let\s+device_family\s*=\s*"desktop"/)
  assert.doesNotMatch(createFrameBlock, /"deviceFamily":\s*device_family/)
})

test('OpenClaw packaged execution requests cannot complete with promise-only text', () => {
  assert.match(openclawChatSource, /function\s+isOpenClawExecutionRequest\(/)
  assert.match(openclawChatSource, /function\s+isOpenClawExecutionEvidenceText\(/)
  assert.match(openclawChatSource, /function\s+isOpenClawExecutionPromiseOnlyReply\(/)
  assert.match(openclawChatSource, /function\s+isOpenClawWorkspaceBootstrapContamination\(/)
  assert.match(openclawChatSource, /function\s+buildOpenClawExecutionUnavailableReply\(/)

  const evidenceBlock = openclawChatSource.match(/function\s+isOpenClawExecutionEvidenceText\([\s\S]*?\n\}/)?.[0] || ''
  assert.match(evidenceBlock, /stdout\\s\*\[:=\]/)
  assert.match(evidenceBlock, /exit\\s\*code\\s\*\[:=\]/)
  assert.doesNotMatch(evidenceBlock, /P0\\s\*/)
  assert.doesNotMatch(evidenceBlock, /P1\\s\*/)
  assert.doesNotMatch(evidenceBlock, /P2\\s\*/)
  assert.doesNotMatch(evidenceBlock, /P3\\s\*/)
  assert.doesNotMatch(evidenceBlock, /P4\\s\*/)

  const finalBlock = openclawChatSource.match(/if \(state === 'final'\) \{[\s\S]*?clearOpenClawGenerationState\(finalTools\.length \|\| _currentAiTools\.length \? 'tool-result-completed' : 'final-completed'/)?.[0] || ''
  assert.match(finalBlock, /isOpenClawExecutionRequest\(activeFinalUserText\)/)
  assert.match(finalBlock, /isOpenClawExecutionPromiseOnlyReply\(visibleFinalText\)/)
  assert.match(finalBlock, /finalTools\.length\s*\|\|\s*_currentAiTools\.length/)
  assert.match(finalBlock, /buildOpenClawExecutionUnavailableReply\(activeFinalUserText\)/)
  assert.match(openclawChatSource, /\\u53e3\\u5934\\u627f\\u8bfa/)
  assert.match(openclawChatSource, /BOOTSTRAP\\\.md/)
  assert.match(openclawChatSource, /\\u8ba9\\u6211/)
  assert.match(openclawChatSource, /工作区里/)
})

test('OpenClaw packaged exact short-answer prompts are not overridden by workspace bootstrap text', () => {
  assert.match(openclawChatSource, /function\s+getOpenClawExactShortReplyTarget\(/)
  assert.match(openclawChatSource, /function\s+normalizeOpenClawExactShortReply\(/)
  assert.match(openclawChatSource, /stableTarget/)
  assert.match(openclawChatSource, /\\u53ea\\u56de\\u590d/)
  assert.match(openclawChatSource, /\\u4e24\\u4e2a\\u5b57/)
  assert.match(openclawChatSource, /\\u6536\\u5230/)
  assert.match(openclawChatSource, /只回复\|只回答\|仅回复\|仅回答/)
  assert.match(openclawChatSource, /两个字\|2\\s\*个字/)

  const finalBlock = openclawChatSource.match(/let visibleFinalText = _currentAiText \|\| finalText[\s\S]*?let hasContent = hasOpenClawRenderableContent/)?.[0] || ''
  assert.match(finalBlock, /normalizeOpenClawExactShortReply\(activeFinalUserText,\s*visibleFinalText\)/)
  assert.match(finalBlock, /_currentAiText\s*=\s*exactShortFinalText/)
  assert.match(finalBlock, /visibleFinalText\s*=\s*exactShortFinalText/)
})

test('OpenClaw packaged identity and execution scopes are seeded for tool dispatch', () => {
  assert.match(openclawCommandsSource, /OPENCLAW_EFFECTIVE_TOOLS_PROFILE:\s*&str\s*=\s*"coding"/)
  assert.match(openclawCommandsSource, /"alsoAllow":\s*\["browser",\s*"desktop_control",\s*"skill_manager",\s*"exec",\s*"process"\]/)
  assert.match(openclawCommandsSource, /"exec":\s*\{\s*"host":\s*"gateway",\s*"security":\s*"full",\s*"ask":\s*"off"\s*\}/)
  assert.match(openclawDeviceSource, /"approvedScopes":\s*SCOPES/)
  for (const scope of ['operator.admin', 'operator.approvals', 'operator.pairing', 'operator.read', 'operator.write']) {
    assert.match(openclawDeviceSource, new RegExp(scope))
  }
})

test('ClaudeCode packaged panel resolves native CLI path or explicitly allows relay fallback', () => {
  assert.match(claudeCommandsSource, /fn\s+effective_claude_cli_path\(resources:\s*&Path\)\s*->\s*PathBuf/)
  assert.match(claudeCommandsSource, /claude\.cmd/)
  assert.match(claudeCommandsSource, /windows_npm_global_prefix/)
  assert.match(claudeCommandsSource, /CLAUDE_CLI_PATH",\s*effective_claude/)
  assert.match(claudeCommandsSource, /CLAUDE_PANEL_ALLOW_RELAY_FALLBACK",\s*"1"/)
  assert.doesNotMatch(claudeCommandsSource, /CLAUDE_PANEL_NATIVE_REQUIRED",\s*"1"/)
})

test('ClaudeCode packaged chat uses relay fallback instead of indefinite native CLI pending', () => {
  assert.match(claudeCommandsSource, /CLAUDE_PANEL_FORCE_RELAY",\s*"1"/)
  assert.match(claudeCommandsSource, /CLEAN_PANEL_RELAY_CONFIG_ENABLED",\s*"1"/)
  assert.match(claudeCommandsSource, /SUPERCLAW_PANEL_CONFIG_PATH/)
  assert.doesNotMatch(claudeCommandsSource, /CLAUDE_PANEL_NATIVE_REQUIRED",\s*"1"/)
})

test('ClaudeCode packaged panel renders markdown and code without unsafe HTML', () => {
  assert.match(claudePanelSource, /function\s+renderClaudeMarkdownInline\(/)
  assert.match(claudePanelSource, /function\s+renderClaudeMarkdownBlocks\(/)
  assert.match(claudePanelSource, /function\s+escapeClaudeMarkdownHtml\(/)
  assert.match(claudePanelSource, /claude-code-block/)
  assert.match(claudePanelSource, /claude-inline-code/)
  assert.match(claudePanelSource, /createElement\("h"\s*\+\s*level\)/)
  assert.match(claudePanelSource, /\?\s*"ol"\s*:\s*"ul"/)
  assert.match(claudePanelSource, /createElement\("pre"\)/)
  assert.match(claudePanelSource, /createElement\("code"\)/)
  assert.match(claudePanelSource, /appendMarkdownFragment\(text,\s*renderClaudeMarkdownInline/)

  const rendererBlock = claudePanelSource.match(/function renderClaudeMarkdownBlocks[\s\S]*?function renderClaudeAgentMessageContent/)?.[0] || ''
  assert.match(claudePanelSource, /code\.textContent\s*=\s*String\(codeText\s*\|\|\s*""\)/)
  assert.doesNotMatch(rendererBlock, /innerHTML\s*=\s*finalText/)
  assert.doesNotMatch(rendererBlock, /innerHTML\s*=\s*value/)
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
