import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

import { compactHermesHistoryContentForPrompt } from '../../src/engines/hermes/lib/chat-store.js'

const hermesStoreSource = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const hermesMemoryStoreSource = readFileSync('src/engines/hermes/lib/hermes-memory-store.js', 'utf8')
const hermesChatSource = readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
const agentMessageContentSource = readFileSync('src/components/chat/agent-message-content.js', 'utf8')
const openclawChatSource = readFileSync('src/pages/chat.js', 'utf8')
const sidebarSource = readFileSync('src/components/sidebar.js', 'utf8')
const openclawCommandsSource = readFileSync('src-tauri/src/commands/mod.rs', 'utf8')
const openclawConfigCommandsSource = readFileSync('src-tauri/src/commands/config.rs', 'utf8')
const openclawServiceSource = readFileSync('src-tauri/src/commands/service.rs', 'utf8')
const openclawUtilsSource = readFileSync('src-tauri/src/utils.rs', 'utf8')
const openclawDeviceSource = readFileSync('src-tauri/src/commands/device.rs', 'utf8')
const claudeCommandsSource = readFileSync('src-tauri/src/commands/claude_code.rs', 'utf8')
const claudePanelSource = readFileSync('src-tauri/resources/runtime/claude-panel/public/app.js', 'utf8')
const claudePanelServerSource = readFileSync('src-tauri/resources/runtime/claude-panel/server.js', 'utf8')
const buildDesktopSource = readFileSync('scripts/build-desktop-client.ps1', 'utf8')
const releaseGateSource = readFileSync('scripts/check-release-gates.mjs', 'utf8')
const modelPageSource = readFileSync('src/pages/models.js', 'utf8')
const testBuildModeSource = readFileSync('src/lib/test-build-mode.js', 'utf8')

test('OpenClaw dev runtime state is isolated from watched packaged resources', () => {
  assert.match(openclawCommandsSource, /cfg\(debug_assertions\)[\s\S]*?\.join\("\.dev-data"\)\.join\("\.openclaw"\)/)
  assert.match(openclawCommandsSource, /ensure_dev_openclaw_data_dir\(&dir, &dev_dir\)/)
  assert.match(openclawCommandsSource, /cfg\(not\(debug_assertions\)\)[\s\S]*?bundled_openclaw_bin_dir\(\)/)
})

test('OpenClaw engine switching allows a full cold gateway startup', () => {
  assert.match(sidebarSource, /OPENCLAW_SWITCH_START_TIMEOUT_MS\s*=\s*45_000/)
  assert.match(sidebarSource, /_waitForOpenClawGatewayHealth\(progress, 78, 90, OPENCLAW_SWITCH_START_TIMEOUT_MS\)/)
})

test('OpenClaw MiniMax test configuration is available in Tauri development mode', () => {
  assert.match(testBuildModeSource, /export function isDevelopmentMode\(\)[\s\S]*?import\.meta\.env\?\.DEV === true/)
  const panelVisibility = modelPageSource.match(/function shouldShowMiniMaxTestPanel[\s\S]*?\n\}/)?.[0] || ''
  assert.match(panelVisibility, /isDevelopmentMode\(\) \|\| isMiniMaxOnlyMode\(\) \|\| isTestBuildMode\(\)/)
  assert.match(modelPageSource, /免登录测试模式/)
  assert.match(modelPageSource, /id="minimax-test-api-key"/)
})

test('OpenClaw chat snapshots visible messages before the engine switch shell replaces content', () => {
  assert.match(openclawChatSource, /window\.addEventListener\('superclaw:before-engine-switch',[\s\S]*?handleOpenClawChatSnapshotLifecycle\('engine-switch'\)/)
  const switchBlock = sidebarSource.match(/if \(eid !== fromEngineId\) \{[\s\S]*?const switchProgress =/)?.[0] || ''
  assert.match(switchBlock, /window\.dispatchEvent\(new CustomEvent\('superclaw:before-engine-switch'/)
  assert.ok(
    switchBlock.indexOf('superclaw:before-engine-switch') < switchBlock.indexOf('contentEl.innerHTML'),
    'OpenClaw must persist the active chat before the switch shell clears #content',
  )
})

test('packaged OpenClaw never adopts a healthy Gateway from another package', () => {
  const cleanupBlock = openclawServiceSource.match(/pub\(crate\) fn cleanup_zombie_gateway_processes\(\) \{[\s\S]*?fn read_process_command_line/)?.[0] || ''

  assert.match(cleanupBlock, /if gateway_pid_belongs_to_current_project\(pid\) \{[\s\S]*?已采纳/)
  assert.match(cleanupBlock, /外部 Gateway 进程 \(PID \{pid\}\)[\s\S]*?foreign 状态/)
  assert.ok(
    cleanupBlock.indexOf('if gateway_pid_belongs_to_current_project(pid)') < cleanupBlock.indexOf('已采纳'),
    'a healthy port occupant must pass the bundled-runtime ownership check before adoption',
  )
})

test('packaged OpenClaw resolves a relative workspace inside portable data', () => {
  const syncEnvBlock = openclawUtilsSource.match(/fn apply_openclaw_dir_env\([\s\S]*?\n\}/)?.[0] || ''
  const asyncEnvBlock = openclawUtilsSource.match(/fn apply_openclaw_dir_env_tokio\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(syncEnvBlock, /cmd\.current_dir\(&openclaw_dir\);/)
  assert.match(asyncEnvBlock, /cmd\.current_dir\(&openclaw_dir\);/)
  assert.match(syncEnvBlock, /cmd\.env\("OPENCLAW_CONFIG_PATH", &config_path\);/)
  assert.match(asyncEnvBlock, /cmd\.env\("OPENCLAW_CONFIG_PATH", &config_path\);/)
})

function renderAgentMessageContentForRegression(content) {
  let source = agentMessageContentSource
    .replace(/^import\s+['"].*?agent-message-content\.css['"];?\s*/m, '')
    .replace(/export function renderAgentMessageContent/, 'function renderAgentMessageContent')
    .replace(/export function renderAgentMessageContentInto[\s\S]*$/, '')
  source += '\nmodule.exports = { renderAgentMessageContent };'
  const sandbox = { module: { exports: {} }, URL }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return sandbox.module.exports.renderAgentMessageContent({ agent: 'hermes', content, markdown: true })
}

test('Hermes packaged chat history keeps a bounded prior assistant answer', () => {
  const previousAssistant = [
    'OLD_ASSISTANT_REPLY_SHOULD_NOT_BE_REPLAYED',
    'x'.repeat(2400),
  ].join('\n')
  const compacted = compactHermesHistoryContentForPrompt('assistant', previousAssistant)

  assert.equal(compacted.includes('OLD_ASSISTANT_REPLY_SHOULD_NOT_BE_REPLAYED'), true)
  assert.equal(compacted.includes('x'.repeat(80)), true)
  assert.equal(compacted.length < previousAssistant.length, true)
  assert.equal(compacted.includes('previous assistant response omitted to avoid replay'), true)
})

test('Hermes keeps short assistant history paired with the prior user turn', () => {
  const previousAssistant = 'previous turn has already been answered'
  const compacted = compactHermesHistoryContentForPrompt('assistant', previousAssistant)

  assert.equal(compacted, previousAssistant)
})
test('Hermes keeps user context intact while compacting assistant history', () => {
  const userContext = '请继续围绕这个商品标题优化，不要改变品牌名。' + ' 用户补充'.repeat(100)
  assert.equal(compactHermesHistoryContentForPrompt('user', userContext), userContext)
})
test('Hermes assistant main chat uses the shared markdown renderer in packaged and web builds', () => {
  const renderBlock = hermesChatSource.match(/function renderCompactAssistantHtml[\s\S]*?function renderMessage/)?.[0] || ''

  assert.match(hermesChatSource, /import \{ renderAgentMessageContent \} from '\.\.\/\.\.\/\.\.\/components\/chat\/agent-message-content\.js'/)
  assert.match(renderBlock, /renderAgentMessageContent\(\{ agent: 'hermes'[\s\S]*markdown:\s*true/)
  assert.doesNotMatch(renderBlock, /mdToHtml\(visibleContent\)/)
})

test('Hermes assistant markdown renders headings, lists, inline code, fenced code, blockquote and escaped html', () => {
  const html = renderAgentMessageContentForRegression([
    '# 一级标题',
    '',
    '- 列表项',
    '1. 有序项',
    '',
    '> 引用内容',
    '',
    '这是 `inline code` 和 **加粗** 以及 ~~删除线~~。',
    '',
    '```python',
    'print("<script>alert(1)</script>")',
    '```',
  ].join('\n'))

  assert.match(html, /<h1 class="agent-message-markdown-heading">/)
  assert.match(html, /<ul class="agent-message-markdown-list">/)
  assert.match(html, /<ol class="agent-message-markdown-list">/)
  assert.match(html, /class="agent-message-icon"/)
  assert.match(html, /class="agent-message-text"/)
  assert.match(html, /<blockquote>引用内容<\/blockquote>/)
  assert.match(html, /agent-message-inline-code/)
  assert.match(html, /<strong class="agent-message-strong">加粗<\/strong>/)
  assert.match(html, /<del>删除线<\/del>/)
  assert.match(html, /agent-message-code-block/)
  assert.match(html, /agent-message-code-lang/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert/)
})

test('Hermes assistant markdown code blocks render copy buttons for packaged and web builds', () => {
  const html = renderAgentMessageContentForRegression([
    '```python',
    'print("hello")',
    '```',
  ].join('\n'))

  assert.match(html, /<button type="button" class="hm-chat-code-copy agent-message-code-copy"/)
  assert.match(html, /aria-label="Copy code"/)
  assert.match(html, /<span class="hm-chat-code-copy-label">Copy<\/span>/)
  assert.match(html, /<span class="agent-message-code-lang">python<\/span>/)
  assert.match(html, /<code>print\(&quot;hello&quot;\)<\/code>/)
})

test('Hermes shared markdown copy icon stays visible under Hermes theme styles', () => {
  const css = readFileSync('src/engines/hermes/style/hermes.css', 'utf8')

  assert.match(css, /\.hm-chat-code-copy\.agent-message-code-copy\s*\{\s*opacity:\s*1;/)
  assert.match(css, /\.agent-message-code-block:hover \.hm-chat-code-copy/)
})

test('Hermes assistant code copy target is pure code without language labels or fences', () => {
  const html = renderAgentMessageContentForRegression([
    '```js',
    'const value = "| kept |";',
    'console.log(value)',
    '```',
  ].join('\n'))
  const code = html.match(/<code>([\s\S]*?)<\/code>/)?.[1] || ''

  assert.match(html, /agent-message-code-copy/)
  assert.equal(code.includes('const value'), true)
  assert.equal(code.includes('console.log'), true)
  assert.equal(code.includes('```'), false)
  assert.equal(code.includes('js'), false)
})

test('Hermes assistant multiple code blocks keep independent copy buttons and code nodes', () => {
  const html = renderAgentMessageContentForRegression([
    '```python',
    'print("one")',
    '```',
    '',
    '```bash',
    'echo two',
    '```',
  ].join('\n'))

  assert.equal((html.match(/agent-message-code-copy/g) || []).length, 2)
  assert.equal((html.match(/<code>/g) || []).length, 2)
  assert.match(html, /<code>print\(&quot;one&quot;\)<\/code>/)
  assert.match(html, /<code>echo two<\/code>/)
})

test('Hermes assistant code copy blocks escape html and script content', () => {
  const html = renderAgentMessageContentForRegression([
    '```html',
    '<script>alert("x")</script>',
    '```',
  ].join('\n'))

  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert/)
})

test('Hermes assistant unwraps an outer markdown fence but preserves inner code fences', () => {
  const html = renderAgentMessageContentForRegression([
    '```markdown',
    '# 包裹标题',
    '',
    '正文段落',
    '',
    '```python',
    'print("kept")',
    '```',
    '```',
  ].join('\n'))

  assert.match(html, /<h1 class="agent-message-markdown-heading">/)
  assert.match(html, /<p>正文段落<\/p>/)
  assert.match(html, /<span class="agent-message-code-lang">python<\/span>/)
  assert.match(html, /print\(&quot;kept&quot;\)/)
  assert.doesNotMatch(html, /<span class="agent-message-code-lang">markdown<\/span>/)
})

test('Hermes assistant markdown blocks unsafe javascript links', () => {
  const html = renderAgentMessageContentForRegression('[bad](javascript:alert(1)) [ok](https://example.com)')

  assert.match(html, /href="#"/)
  assert.match(html, /href="https:\/\/example\.com"/)
  assert.doesNotMatch(html, /href="javascript:/)
})

test('Hermes assistant markdown renders standard tables as real table elements', () => {
  const html = renderAgentMessageContentForRegression([
    '| Column A | Column B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '| 3 | 4 |',
  ].join('\n'))

  assert.match(html, /<table class="agent-message-markdown-table">/)
  assert.match(html, /<thead><tr><th style="text-align:left">Column A<\/th><th style="text-align:left">Column B<\/th><\/tr><\/thead>/)
  assert.match(html, /<tbody><tr><td style="text-align:left">1<\/td><td style="text-align:left">2<\/td><\/tr>/)
  assert.doesNotMatch(html, /\| --- \| --- \|/)
})

test('Hermes assistant markdown table cells escape html content', () => {
  const html = renderAgentMessageContentForRegression([
    '| Name | Value |',
    '| --- | --- |',
    '| safe | <script>alert(1)</script> |',
  ].join('\n'))

  assert.match(html, /<table class="agent-message-markdown-table">/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert/)
})

test('Hermes assistant markdown does not parse table syntax inside fenced code blocks', () => {
  const html = renderAgentMessageContentForRegression([
    '```text',
    '| Column A | Column B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '```',
  ].join('\n'))

  assert.match(html, /<pre class="agent-message-code-block">/)
  assert.match(html, /<span class="agent-message-code-lang">text<\/span>/)
  assert.match(html, /\| Column A \| Column B \|/)
  assert.doesNotMatch(html, /<table class="agent-message-markdown-table">/)
})

test('Hermes stream assistant lookup prefers exact clientRequestId over stale pending assistant', () => {
  const lookupBlock = hermesStoreSource.match(/function findAssistantMessage\(session, clientRequestId\) \{[\s\S]*?function ensureAssistantMessage/)?.[0] || ''

  assert.match(lookupBlock, /const mappedId = clientRequestId/)
  assert.match(lookupBlock, /m\.clientRequestId === clientRequestId/)
  assert.match(lookupBlock, /getHermesAssistantMessageId\(clientRequestId\)/)
  assert.match(lookupBlock, /if \(state\.pendingAssistantId\)/)
  assert.ok(lookupBlock.indexOf('m.clientRequestId === clientRequestId') < lookupBlock.indexOf('if (state.pendingAssistantId)'))
})

test('Hermes streaming deltas do not run final reply completion on every chunk', () => {
  const sanitizeBlock = hermesStoreSource.match(/function sanitizeHermesVisibleReply\(text, prompt = currentVisibleUserPrompt\(\), options = \{\}\) \{[\s\S]*?function findAssistantMessage/)?.[0] || ''

  const streamingBlock = sanitizeBlock.match(/if \(options\.streaming === true\) \{[\s\S]*?\n\s*\}/)?.[0] || ''
  assert.match(streamingBlock, /normalizeHermesStreamText\(text\)/)
  assert.doesNotMatch(streamingBlock, /completeHermesReplyIfNeeded/)
  assert.match(sanitizeBlock, /completeHermesReplyIfNeeded\(redacted/)

  const streamDeltaCalls = hermesStoreSource.match(/sanitizeHermesVisibleReply\(msg\.content \+ (?:delta|accepted\.text), currentVisibleUserPrompt\(\), \{ streaming: true \}\)/g) || []
  assert.ok(streamDeltaCalls.length >= 2)
})

test('Hermes default conversation history uses bounded completed turns', () => {
  const historyBlock = hermesStoreSource.match(/function buildDefaultConversationHistory\(session, currentMessageId\) \{[\s\S]*?function normalizeAttachments/)?.[0] || ''

  assert.match(hermesStoreSource, /const HISTORY_MAX_TURNS = 6/)
  assert.match(hermesStoreSource, /const HISTORY_MAX_CHARS = 10000/)
  assert.match(hermesStoreSource, /const HISTORY_ASSISTANT_MAX_CHARS = 1600/)
  assert.match(historyBlock, /const completedTurns = \[\]/)
  assert.match(historyBlock, /if \(!pendingUser\) continue/)
  assert.match(historyBlock, /selectedTurns\.reverse\(\)\.flat\(\)/)
})

test('Hermes exact short replies run without conversation history contamination', () => {
  const sendBlock = hermesStoreSource.match(/async function sendMessage\(content, opts = \{\}\) \{[\s\S]*?const runPromise = Promise\.resolve\(\)\.then/)?.[0] || ''

  assert.match(sendBlock, /getHermesExactShortReplyTarget\(displayText \|\| runText\)/)
  assert.match(sendBlock, /forceEmptyHistory = true/)
  assert.match(hermesStoreSource, /normalizeHermesExactShortReply\(currentVisibleUserPrompt\(\), msg\.content\)/)
  assert.ok(hermesStoreSource.includes("if (asksExactReply && /\\u6536\\u5230/.test(value)) return '\\u6536\\u5230'"))
})

test('Hermes conversation history strips stale reply-only directives from prior user turns', () => {
  const historyBlock = hermesStoreSource.match(/function messageTextForHistory\(message, role = ''\) \{[\s\S]*?function normalizeHermesHistoryComparableText/)?.[0] || ''

  assert.match(hermesStoreSource, /function stripHermesReplyOnlyDirectiveForHistory\(text\)/)
  assert.match(historyBlock, /if \(role === 'user'\) text = stripHermesReplyOnlyDirectiveForHistory\(text\)/)
  assert.match(hermesStoreSource, /\?:\u53ea\|\u4ec5/)
  assert.match(hermesStoreSource, /\u6536\u5230/)
})

test('Hermes exact short replies protect the local tail from stale backend refresh snapshots', () => {
  assert.match(hermesStoreSource, /const HERMES_EXACT_SHORT_LOCAL_TAIL_HOLD_MS = 12 \* 1000/)
  assert.match(hermesStoreSource, /function markHermesExactShortLocalTail\(session, userText = ''\)/)
  assert.match(hermesStoreSource, /function hasHermesProtectedLocalTail\(session\)/)
  assert.match(hermesStoreSource, /if \(hasHermesProtectedLocalTail\(target\)\) \{\s*forceRemoteRefreshIds\.delete\(sid\)\s*return\s*\}/)
  assert.match(hermesStoreSource, /markHermesExactShortLocalTail\(s, currentVisibleUserPrompt\(\)\)/)
})

test('Hermes explicit memory commands can save safe simple facts', () => {
  const addBlock = hermesMemoryStoreSource.match(/export function addHermesMemory\(input = \{\}\) \{[\s\S]*?export function updateHermesMemory/)?.[0] || ''

  assert.match(addBlock, /const source = normalizeSource\(input\.source\)/)
  assert.match(addBlock, /source !== 'migrated_safe' && source !== 'explicit' && !shouldSaveHermesMemory\(text\)/)
  assert.match(hermesMemoryStoreSource, /containsSensitiveMemoryText\(text\)/)
})

test('Hermes memory strips reply-only directives from saved facts', () => {
  assert.match(hermesMemoryStoreSource, /function stripReplyOnlyDirective\(text\)/)
  assert.match(hermesMemoryStoreSource, /const text = sanitizeMemoryText\(stripReplyOnlyDirective\(rawText\)\)/)
  assert.match(hermesMemoryStoreSource, /const text = stripReplyOnlyDirective\(input\.text \|\| input\.content \|\| ''\)/)
  assert.match(hermesMemoryStoreSource, /\?:\u53ea\|\u4ec5/)
  assert.match(hermesMemoryStoreSource, /\u6536\u5230/)
})

test('Hermes local memory commands honor exact short reply requests', () => {
  const memoryBlock = hermesStoreSource.match(/const memoryCommandReply = handleHermesMemoryCommand\(rawText\)[\s\S]*?return Promise\.resolve\(\{ status: 'success', reason: 'memory-command' \}\)/)?.[0] || ''

  assert.match(memoryBlock, /const visibleMemoryReply = normalizeHermesExactShortReply\(displayText \|\| runText \|\| rawText, memoryCommandReply\)/)
  assert.match(memoryBlock, /content: visibleMemoryReply/)
  assert.match(memoryBlock, /markHermesExactShortLocalTail\(memorySession, displayText \|\| runText \|\| rawText\)/)
})

test('Hermes packaged stream deltas and finals are bound to the active request id', () => {
  assert.match(hermesStoreSource, /function appendStreamDelta\(runSessionId, delta, clientRequestId = state\.runningClientRequestId\)/)
  assert.match(hermesStoreSource, /ensureAssistantMessage\(s, clientRequestId\)/)
  assert.match(hermesStoreSource, /const eventRequestId = state\.runningClientRequestId/)
  assert.match(hermesStoreSource, /appendStreamDelta\(effectiveSessionId, accepted\.text, eventRequestId\)/)
  assert.match(hermesStoreSource, /completeStreamRun\(effectiveSessionId, accepted\.output \|\| evt\.output \|\| '', eventRequestId\)/)
  assert.match(hermesStoreSource, /failStreamRun\(effectiveSessionId, evt\.error \|\| 'unknown error', eventRequestId\)/)
})

test('Hermes packaged stream events reject stale request ids before mutating messages', () => {
  const handleBlock = hermesStoreSource.match(/function handleStreamEvent\(runSessionId, evt\) \{[\s\S]*?function cleanupAfterRun/)?.[0] || ''

  assert.match(handleBlock, /activeResponseAssembler && !activeResponseAssembler\.matches\(evt\)/)
  assert.ok(handleBlock.indexOf('activeResponseAssembler && !activeResponseAssembler.matches(evt)') < handleBlock.indexOf('appendStreamDelta'))
})

test('Hermes Tauri stream listeners write to the captured request id instead of a later request', () => {
  const listenerBlock = hermesStoreSource.match(/async function attachStreamListeners\(runSessionId, clientRequestId\) \{[\s\S]*?function detachStreamListeners/)?.[0] || ''

  assert.match(listenerBlock, /if \(clientRequestId && state\.runningClientRequestId !== clientRequestId\) return false/)
  assert.match(listenerBlock, /ensureAssistantMessage\(s, clientRequestId\)/)
  assert.match(listenerBlock, /clientRequestId: t\.clientRequestId \|\| clientRequestId/)
  assert.doesNotMatch(listenerBlock, /ensureAssistantMessage\(s, state\.runningClientRequestId\)/)
})

test('Hermes packaged chat input defaults to a single visual row', () => {
  const css = readFileSync('src/engines/hermes/style/hermes.css', 'utf8')
  const inputMarkupBlock = hermesChatSource.match(/<textarea id="hm-chat-input"[\s\S]*?<\/textarea>/)?.[0] || ''
  const inputCssBlock = css.match(/\[data-engine="hermes"\] \.hm-chat-input \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(inputMarkupBlock, /rows="1"/)
  assert.match(inputCssBlock, /line-height:\s*22px/)
  assert.match(inputCssBlock, /box-sizing:\s*border-box/)
  assert.match(inputCssBlock, /min-height:\s*32px/)
  assert.match(inputCssBlock, /padding:\s*5px 2px/)
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

test('Hermes long-task guard does not treat markdown rendering tests as tool execution tasks', () => {
  const longTaskBlock = hermesStoreSource.match(/function isHermesLongTaskRequest\(text\) \{[\s\S]*?function getHermesExactShortReplyTarget/)?.[0] || ''

  assert.match(longTaskBlock, /markdown\|md\\s\*格式/)
  assert.match(longTaskBlock, /\\u6807\\u9898\|\\u5217\\u8868\|\\u5f15\\u7528\|\\u4ee3\\u7801\\u5757\|\\u8868\\u683c/)
  assert.match(longTaskBlock, /\\u56de\\u590d\|\\u6e32\\u67d3\|\\u683c\\u5f0f\|\\u6837\\u5f0f\|\\u663e\\u793a\|\\u6d4b\\u8bd5/)
  assert.ok(
    longTaskBlock.indexOf('markdown|md\\s*格式') < longTaskBlock.indexOf('const hasAction'),
    'formatting-only markdown prompts must exit before script/test long-task detection',
  )
})

test('Hermes packaged exact short-answer prompts override contaminated final text', () => {
  assert.match(hermesStoreSource, /function\s+getHermesExactShortReplyTarget\(/)
  assert.match(hermesStoreSource, /function\s+normalizeHermesExactShortReply\(/)
  assert.match(hermesStoreSource, /\\u53ea\\u56de\\u590d/)
  assert.match(hermesStoreSource, /\\u4e24\\u4e2a\\u5b57/)
  assert.match(hermesStoreSource, /\\u6536\\u5230/)

  const doneBlock = hermesStoreSource.match(/tauriListen\('hermes-run-done'[\s\S]*?cleanupAfterRun\(\{ status: 'success', reason: 'run-completed' \}\)/)?.[0] || ''
  assert.match(doneBlock, /normalizeHermesExactShortReply\(currentVisibleUserPrompt\(\),\s*msg\.content\)/)
  assert.match(doneBlock, /completeHermesReplyIfNeeded/)
})

test('Hermes packaged visible replies redact real provider secrets and config paths', () => {
  assert.match(hermesStoreSource, /function\s+redactHermesSensitiveVisibleText\(/)
  assert.match(hermesStoreSource, /sk-cp\|sk-proj/)
  assert.match(hermesStoreSource, /MINIMAX_API_KEY\|OPENAI_API_KEY\|CLAUDE_API_KEY/)
  assert.match(hermesStoreSource, /config\\\.yaml\|\\\.env\|openclaw\\\.json\|relay-config\\\.json/)

  const visibleSanitizerBlock = hermesStoreSource.match(/function sanitizeHermesVisibleReply[\s\S]*?function notifySync/)?.[0] || ''
  assert.match(visibleSanitizerBlock, /redactHermesSensitiveVisibleText\(guarded\)/)
  assert.doesNotMatch(visibleSanitizerBlock, /return completeHermesReplyIfNeeded\(guarded/)
})

test('Hermes ordinary incomplete-looking replies are not replaced by the generic retry fallback', () => {
  const guardSource = readFileSync('src/shared/chat-output-guard.js', 'utf8')
  const repairBlock = guardSource.match(/function repairIncompleteVisibleReply\(text = '', \{ agent = '', userText = '' \} = \{\}\) \{[\s\S]*?export function ensureCompleteVisibleReply/)?.[0] || ''
  const storeSanitizerBlock = hermesStoreSource.match(/function sanitizeHermesVisibleReply\(text, prompt = currentVisibleUserPrompt\(\), options = \{\}\) \{[\s\S]*?function findAssistantMessage/)?.[0] || ''
  const restoreBlock = hermesStoreSource.match(/function normalizeHermesRestoredMessages\(messages = \[\]\) \{[\s\S]*?function loadSessionsCache/)?.[0] || ''

  assert.match(repairBlock, /if \(\/hermes\/i\.test\(String\(agent \|\| ''\)\)\) \{\s*return safe \|\| s\s*\}/)
  assert.ok(
    repairBlock.indexOf("if (/hermes/i.test(String(agent || '')))") < repairBlock.indexOf('这次回复没有完整生成'),
    'Hermes must return the original partial reply before the generic retry fallback',
  )
  assert.match(hermesStoreSource, /const HERMES_GENERIC_RETRY_FALLBACK_TEXT = /)
  assert.match(hermesStoreSource, /function stripHermesGenericRetryFallback\(text\) \{/)
  assert.match(storeSanitizerBlock, /stripHermesGenericRetryFallback\(redactHermesSensitiveVisibleText\(guarded\)\)/)
  assert.match(restoreBlock, /stripHermesGenericRetryFallback\(message\.content\)/)
})

test('Hermes packaged candidate includes offline skills and keeps terminal page safe', () => {
  assert.match(buildDesktopSource, /function\s+Count-HermesSkillFiles\(/)
  assert.match(buildDesktopSource, /function\s+Ensure-PackagedHermesSkills\(/)
  assert.match(buildDesktopSource, /data\\hermes-source\\hermes-agent-main\\skills/)
  assert.match(buildDesktopSource, /Ensure-PackagedHermesSkills\s+\$HermesDataDir/)
  assert.match(buildDesktopSource, /\$PackagedHermesSkillCount\s+-lt\s+20/)
  assert.match(buildDesktopSource, /Packaged Hermes offline skills/)
  assert.match(buildDesktopSource, /function\s+Write-PortableHermesLauncher\(/)
  assert.match(buildDesktopSource, /runtime\\hermes\.cmd/)
  assert.match(buildDesktopSource, /PYTHON_EXE/)
  assert.match(buildDesktopSource, /-m hermes_cli\.main/)
  assert.match(buildDesktopSource, /Write-PortableHermesLauncher\s+\$PackagedResources/)
})

test('Hermes packaged terminal uses bundled Git Bash instead of Windows WSL shim', () => {
  const launcherBlock = buildDesktopSource.match(/function Write-PortableHermesLauncher[\s\S]*?^}/m)?.[0] || ''
  assert.match(launcherBlock, /HERMES_PORTABLE_GIT_BASH=%SUPERCLAW_RUNTIME_DIR%git\\bin\\bash\.exe/)
  assert.match(launcherBlock, /HERMES_GIT_BASH_PATH=%HERMES_PORTABLE_GIT_BASH%/)
  assert.match(launcherBlock, /%ProgramFiles%\\Git\\bin\\bash\.exe/)
  assert.doesNotMatch(launcherBlock, /System32\\bash\.exe/i)

  assert.match(buildDesktopSource, /function\s+Find-GitForWindowsRuntimeSource\b/)
  assert.match(buildDesktopSource, /function\s+Copy-PortableGitForHermes\b/)
  assert.match(buildDesktopSource, /Copy-PortableGitForHermes\s+\$PackagedResources/)
  assert.match(buildDesktopSource, /runtime\\git\\bin\\bash\.exe/)
  assert.match(buildDesktopSource, /Packaged Git Bash for Hermes terminal/)
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
  assert.match(openclawCommandsSource, /control_ui\.insert\("allowInsecureAuth"\.into\(\), serde_json::Value::Bool\(false\)\)/)
  assert.doesNotMatch(openclawConfigCommandsSource, /"allowInsecureAuth":\s*true|allowInsecureAuth"\.into\(\), Value::Bool\(true\)/)
})

test('packaged OpenClaw includes the native SuperClaw task policy skill', () => {
  assert.match(
    buildDesktopSource,
    /templates\\openclaw-workspace\\skills\\superclaw-task-policy\\SKILL\.md/,
  )
  assert.match(buildDesktopSource, /Packaged SuperClaw native task policy skill/)
  assert.match(buildDesktopSource, /contextInjection\s*=\s*"always"/)
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

test('OpenClaw keeps a tool-use prelude and final reply in the same active run', () => {
  const streamMatchBlock = openclawChatSource.match(/function isOpenClawStreamIdMismatch\([\s\S]*?\n\}/)?.[0] || ''
  const deltaBlock = openclawChatSource.match(/if \(state === 'delta'\) \{[\s\S]*?\n  \}/)?.[0] || ''
  const finalBlock = openclawChatSource.match(/if \(state === 'final'\) \{[\s\S]*?clearOpenClawGenerationState\(finalTools\.length \|\| _currentAiTools\.length \? 'tool-result-completed' : 'final-completed'/)?.[0] || ''

  assert.match(streamMatchBlock, /function isOpenClawStreamIdMismatch\(event = \{\}, stableStreamId = ''\)/)
  assert.match(streamMatchBlock, /activeRunId/)
  assert.match(streamMatchBlock, /eventRunId/)
  assert.match(streamMatchBlock, /activeRunId === eventRunId/)
  assert.match(streamMatchBlock, /activeRunId !== eventRunId/)
  assert.match(streamMatchBlock, /activeSessionKey/)
  assert.match(streamMatchBlock, /eventSessionKey/)
  assert.match(streamMatchBlock, /eventRequestIds\.includes\(activeRequestId\)/)
  assert.match(streamMatchBlock, /return !isOpenClawGenerationActive\(\)/)
  assert.match(deltaBlock, /isOpenClawStreamIdMismatch\(payload, stableStreamId\)/)
  assert.match(finalBlock, /isOpenClawStreamIdMismatch\(payload, stableStreamId\)/)
  assert.match(finalBlock, /chooseOpenClawCompletionText\(/)
  assert.match(finalBlock, /renderCompactAssistantContent\(_currentAiText, _currentAiBubble, \{ phase: 'completed' \}\)/)
})

test('OpenClaw recovers the completed history reply after a tool-use prelude', () => {
  const recoveryBlock = openclawChatSource.match(/function scheduleOpenClawToolFinalRecovery\([\s\S]*?\n\}/)?.[0] || ''
  const candidateBlock = openclawChatSource.match(/function canRecoverOpenClawDraftFromLatestHistory\([\s\S]*?\n\}/)?.[0] || ''
  const deltaBlock = openclawChatSource.match(/if \(state === 'delta'\) \{[\s\S]*?\n  \}/)?.[0] || ''

  assert.match(recoveryBlock, /recoverOpenClawAssistantFromHistoryBeforeFallback\('tool-final-history-recovery'/)
  assert.match(recoveryBlock, /attempts:\s*40/)
  assert.match(recoveryBlock, /isOpenClawGenerationActive\(\)/)
  assert.match(candidateBlock, /recoveringToolTurn/)
  assert.match(candidateBlock, /_activeOpenClawRun\?\.sawToolCall/)
  assert.match(deltaBlock, /updateOpenClawActiveRun\(\{ sawToolCall: true \}\)/)
  assert.match(deltaBlock, /scheduleOpenClawToolFinalRecovery\(terminalRequestId\)/)
})

test('OpenClaw packaged exact short-answer prompts are not overridden by workspace bootstrap text', () => {
  assert.match(openclawChatSource, /function\s+getOpenClawExactShortReplyTarget\(/)
  assert.match(openclawChatSource, /function\s+normalizeOpenClawExactShortReply\(/)
  assert.match(openclawChatSource, /function\s+getOpenClawRequestedShortLiteral\(/)
  assert.match(openclawChatSource, /stableTarget/)
  assert.match(openclawChatSource, /\\u53ea\\u56de\\u590d/)
  assert.match(openclawChatSource, /\\u4e24\\u4e2a\\u5b57/)
  assert.match(openclawChatSource, /\\u6536\\u5230/)
  assert.match(openclawChatSource, /只回复\|只回答\|仅回复\|仅回答/)
  assert.match(openclawChatSource, /两个字\|2\\s\*个字/)

  const finalBlock = openclawChatSource.match(/let visibleFinalText = _currentAiText \|\| finalText[\s\S]*?let hasContent = hasOpenClawRenderableContent/)?.[0] || ''
  const preIncompleteBlock = openclawChatSource.match(/const exactShortPreFinalText = normalizeOpenClawExactShortReply[\s\S]*?keepOpenClawIncompleteFinalPending/)?.[0] || ''
  assert.match(preIncompleteBlock, /normalizeOpenClawExactShortReply\(activeFinalUserText,\s*_currentAiText\)/)
  assert.match(preIncompleteBlock, /_currentAiText\s*=\s*exactShortPreFinalText/)
  assert.ok(
    preIncompleteBlock.indexOf('normalizeOpenClawExactShortReply') < preIncompleteBlock.indexOf('isOpenClawTextClearlyIncomplete'),
    'strict short-answer normalization must run before incomplete fallback recovery'
  )
  assert.match(finalBlock, /normalizeOpenClawExactShortReply\(activeFinalUserText,\s*visibleFinalText\)/)
  assert.match(finalBlock, /_currentAiText\s*=\s*exactShortFinalText/)
  assert.match(finalBlock, /visibleFinalText\s*=\s*exactShortFinalText/)

  const silentReplyBlock = openclawChatSource.match(/function\s+getOpenClawRequestedShortLiteral[\s\S]*?function recoverOpenClawSilentReplyForExactLiteral/)?.[0] || ''
  assert.match(silentReplyBlock, /getOpenClawExactShortReplyTarget\(value\)/)
  assert.match(silentReplyBlock, /if \(exactTarget\) return exactTarget/)

  const historyRecoveryBlock = openclawChatSource.match(/function\s+completeStreamingDraftFromHistory\(msg\) \{[\s\S]*?function completeOpenClawCurrentDraftFromLatestHistory/)?.[0] || ''
  assert.match(historyRecoveryBlock, /const recoveryUserText = _activeOpenClawRun\?\.userText \|\| _activeOpenClawUserText \|\| _lastVisibleUserText/)
  assert.match(historyRecoveryBlock, /normalizeOpenClawExactShortReply\(recoveryUserText,\s*normalizeVisibleOpenClawText\(bestText\)\)/)
  assert.match(historyRecoveryBlock, /const visibleDraftText = finalText \|\| bestText/)
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

test('OpenClaw packaged gateway start refuses foreign global gateway ownership', () => {
  const windowsStartBlock = readFileSync('src-tauri/src/commands/service.rs', 'utf8')
    .match(/pub async fn start_service_impl\(_label: &str\) -> Result<\(\), String> \{[\s\S]*?let Some\(_start_guard\)/)?.[0] || ''

  assert.match(windowsStartBlock, /gateway_pid_belongs_to_current_project\(pid\)/)
  assert.match(windowsStartBlock, /foreign_gateway_error\(Some\(pid\)\)/)
  assert.doesNotMatch(
    windowsStartBlock,
    /if pid\.is_some\(\) \{[\s\S]*?return Ok\(\);\s*\}/,
    'packaged OpenClaw must not accept any listening OpenClaw PID as current package ownership',
  )
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

test('ClaudeCode packaged chat cannot stay pending without a timeout final state', () => {
  assert.match(claudePanelSource, /CLAUDE_RUN_TIMEOUT_MS/)
  assert.match(claudePanelSource, /runTimedOut\s*=\s*true/)
  assert.match(claudePanelSource, /runController\.abort\(\)/)
  assert.match(claudePanelSource, /ClaudeCode request timed out before a final response/)

  assert.match(claudePanelSource, /if \(error\.name === "AbortError" && runTimedOut\)/)
  assert.match(claudePanelSource, /setRunState\("error",\s*"Request timed out"\)/)
  assert.match(claudePanelSource, /appendActiveRunConversationMessage\("error",\s*"Request timed out"/)
  assert.match(claudePanelSource, /clearTimeout\(runTimeoutTimer\)/)
  assert.match(claudePanelSource, /const sawFinalEvent = await readSse\(response\)/)
  assert.match(claudePanelSource, /ClaudeCode stream ended without a final response/)
  assert.match(claudePanelSource, /if \(!sawFinalEvent\)[\s\S]*?setRunState\("error",\s*"运行异常"\)/)
  assert.match(claudePanelSource, /function handlePacket\(packet\)[\s\S]*?return true;[\s\S]*?event === "done"[\s\S]*?return true;/)

  assert.match(claudePanelServerSource, /RELAY_RUN_TIMEOUT_MS/)
  assert.match(claudePanelServerSource, /new AbortController\(\)/)
  assert.match(claudePanelServerSource, /relayTimedOut\s*=\s*true/)
  assert.match(claudePanelServerSource, /signal:\s*relayController\.signal/)
  assert.match(claudePanelServerSource, /CLAUDE_RELAY_TIMEOUT/)
})

test('ClaudeCode packaged missing run configuration fails before thinking state', () => {
  assert.match(claudePanelSource, /function\s+buildClaudeRunBlockingConfigMessage\(\)/)
  assert.match(claudePanelSource, /function\s+buildClaudeRunBlockingConfigMessageStable\(\)/)
  assert.match(claudePanelSource, /setupMissingItems\(\)\.filter/)
  assert.match(claudePanelSource, /主模型\|接口地址\|中转站地址\|项目路径/)
  assert.match(claudePanelSource, /Configuration incomplete/)
  assert.match(claudePanelSource, /base URL \/ relay endpoint is not configured/)
  assert.match(claudePanelSource, /main model is not configured/)
  assert.match(claudePanelSource, /project path is not configured/)

  const startRunBlock = claudePanelSource.match(/async function startRun\(prompt, overrides = \{\}\)[\s\S]*?runController = new AbortController\(\)/)?.[0] || ''
  assert.match(startRunBlock, /buildClaudeRunBlockingConfigMessageStable\(\)/)
  assert.match(startRunBlock, /setRunState\("error",\s*"Configuration incomplete"\)/)
  assert.match(startRunBlock, /addMessage\("error",\s*"Configuration incomplete"/)
  assert.match(startRunBlock, /updateCurrentConversation\(\{\s*status:\s*"\\u8fd0\\u884c\\u5f02\\u5e38"/)
  assert.match(startRunBlock, /return;[\s\S]*?runController = new AbortController\(\)/)
})

test('ClaudeCode packaged relay model hydrates the active main model before run blocking', () => {
  const relayLoadBlock = claudePanelSource.match(/async function loadRelayConfig\(\)[\s\S]*?function applyRelayConfigToForm/)?.[0] || ''
  assert.match(relayLoadBlock, /const relayModel = String\(displayConfig\?\.model/)
  assert.match(relayLoadBlock, /currentMainModel = relayModel/)
  assert.match(relayLoadBlock, /modelInput\.value = relayModel/)
  assert.match(relayLoadBlock, /window\.localStorage\.setItem\(modelStorageKey,\s*relayModel\)/)
  assert.match(relayLoadBlock, /updateModelSwitchLabels\(\)/)
  assert.match(relayLoadBlock, /renderBranchModelOptions\(\)/)

  const blockingBlock = claudePanelSource.match(/function buildClaudeRunBlockingConfigMessageStable\(\)[\s\S]*?async function startRun/)?.[0] || ''
  assert.match(blockingBlock, /relayConfig\.model/)
  assert.match(blockingBlock, /latestStatus\?\.model/)
})

test('ClaudeCode packaged stale running conversations restore as terminal errors', () => {
  assert.match(claudePanelSource, /function\s+statusClassForConversation\(status\)/)
  assert.match(claudePanelSource, /function\s+finalizeRestoredRunningConversation\(/)
  assert.match(claudePanelSource, /ClaudeCode previous packaged run was interrupted before a final response/)
  assert.match(claudePanelSource, /statusClassForConversation\(normalizedStatus\)\s*!==\s*"thinking"/)
  assert.match(claudePanelSource, /function\s+statusToRunState\(status\)[\s\S]*?const statusClass = statusClassForConversation\(normalized\)/)
  assert.match(claudePanelSource, /status:\s*"运行异常"/)

  const loadBlock = claudePanelSource.match(/function loadConversations\(\)[\s\S]*?function normalizeConversationStatus/)?.[0] || ''
  assert.match(loadBlock, /finalizeRestoredRunningConversation\(/)
  assert.doesNotMatch(loadBlock, /status:\s*normalizeConversationStatus\(conversation\.status\),\s*pinned/)
})

test('ClaudeCode packaged stale managed project paths are restored before resolveCwd', () => {
  assert.match(claudePanelServerSource, /function\s+restoreManagedProjectFolderIfMissing\(input\)/)
  assert.match(claudePanelServerSource, /const managedRoot = getManagedProjectsRoot\(\)/)
  assert.match(claudePanelServerSource, /fs\.mkdirSync\(managedRoot,\s*\{\s*recursive:\s*true\s*\}\)/)
  assert.match(claudePanelServerSource, /if \(!isSameOrInside\(requested,\s*managedRootReal\)\)/)
  assert.match(claudePanelServerSource, /fs\.mkdirSync\(requested,\s*\{\s*recursive:\s*true\s*\}\)/)
  assert.match(claudePanelServerSource, /writeManagedProjectFolders\(/)

  const resolveBlock = claudePanelServerSource.match(/function resolveCwd\(input\)[\s\S]*?const roots = getExecutionRoots\(\)/)?.[0] || ''
  assert.match(resolveBlock, /restoreManagedProjectFolderIfMissing\(input\)/)
  assert.doesNotMatch(resolveBlock, /input\s*\?\s*realPath\(String\(input\)\)/)
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
  assert.match(claudePanelSource, /return normalized\s*\n\s*\.replace\(/)

  const rendererBlock = claudePanelSource.match(/function renderClaudeMarkdownBlocks[\s\S]*?function renderClaudeAgentMessageContent/)?.[0] || ''
  const collapseBlock = claudePanelSource.match(/function shouldCollapseCompactMessage[\s\S]*?function createCompactPanelPreview/)?.[0] || ''
  const spacingBlock = claudePanelSource.match(/function compactPanelMarkdownSpacing[\s\S]*?function compactClaudePanelMessage/)?.[0] || ''
  assert.match(claudePanelSource, /code\.textContent\s*=\s*String\(codeText\s*\|\|\s*""\)/)
  assert.doesNotMatch(rendererBlock, /innerHTML\s*=\s*finalText/)
  assert.doesNotMatch(rendererBlock, /innerHTML\s*=\s*value/)
  assert.doesNotMatch(collapseBlock, /codeBlockCount\s*>?=/)
  assert.doesNotMatch(spacingBlock, /compactPanelBulletSections\(normalized\)/)
  assert.doesNotMatch(spacingBlock, /\[代码块已折叠\]/)
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
