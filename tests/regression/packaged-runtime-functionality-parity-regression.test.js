import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

import {
  compactHermesHistoryContentForPrompt,
  extractHermesVisibleExecutionNarration,
  preserveHermesMediaProtocol,
  stripHermesVisibleExecutionNarration,
} from '../../src/engines/hermes/lib/chat-store.js'
import { normalizeHermesVisibleReply } from '../../src/engines/hermes/lib/hermes-response-assembler.js'
import { splitMediaProtocol } from '../../src/shared/chat-output-guard.js'

const hermesStoreSource = readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')
const hermesMemoryStoreSource = readFileSync('src/engines/hermes/lib/hermes-memory-store.js', 'utf8')
const assistantCommandSource = readFileSync('src-tauri/src/commands/assistant.rs', 'utf8')
const hermesChatSource = readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
const hermesStyleSource = readFileSync('src/engines/hermes/style/hermes.css', 'utf8')
const hermesChatMediaToolSource = readFileSync('src-tauri/resources/runtime/hermes-agent/Lib/site-packages/tools/chat_media_return_tool.py', 'utf8')
const hermesApiServerSource = readFileSync('src-tauri/resources/runtime/hermes-agent/Lib/site-packages/gateway/platforms/api_server.py', 'utf8')
const hermesCommandsSource = readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')
const agentMessageContentSource = readFileSync('src/components/chat/agent-message-content.js', 'utf8')
const openclawChatSource = readFileSync('src/pages/chat.js', 'utf8')
const tauriApiSource = readFileSync('src/lib/tauri-api.js', 'utf8')
const openclawWsClientSource = readFileSync('src/lib/ws-client.js', 'utf8')
const openclawMessageDbSource = readFileSync('src/lib/message-db.js', 'utf8')
const openclawHistorySource = readFileSync('src-tauri/src/commands/openclaw_history.rs', 'utf8')
const sidebarSource = readFileSync('src/components/sidebar.js', 'utf8')
const openclawCommandsSource = readFileSync('src-tauri/src/commands/mod.rs', 'utf8')
const tauriLibSource = readFileSync('src-tauri/src/lib.rs', 'utf8')
const openclawConfigCommandsSource = readFileSync('src-tauri/src/commands/config.rs', 'utf8')
const openclawServiceSource = readFileSync('src-tauri/src/commands/service.rs', 'utf8')
const openclawUtilsSource = readFileSync('src-tauri/src/utils.rs', 'utf8')
const openclawDeviceSource = readFileSync('src-tauri/src/commands/device.rs', 'utf8')
const claudeCommandsSource = readFileSync('src-tauri/src/commands/claude_code.rs', 'utf8')
const claudePanelSource = readFileSync('src-tauri/resources/runtime/claude-panel/public/app.js', 'utf8')
const claudePanelStylesSource = readFileSync('src-tauri/resources/runtime/claude-panel/public/styles.css', 'utf8')
const claudePanelHtmlSource = readFileSync('src-tauri/resources/runtime/claude-panel/public/index.html', 'utf8')
const claudePanelServerSource = readFileSync('src-tauri/resources/runtime/claude-panel/server.js', 'utf8')
const claudeLocalDesktopMcpSource = readFileSync('src-tauri/resources/runtime/claude-panel/local-desktop-mcp.js', 'utf8')
const buildDesktopSource = readFileSync('scripts/build-desktop-client.ps1', 'utf8')
const devApiSource = readFileSync('scripts/dev-api.js', 'utf8')
const openclawUploadPatchSource = readFileSync('scripts/patch-openclaw-upload-runtime.mjs', 'utf8')
const tauriConfigSource = readFileSync('src-tauri/tauri.conf.json', 'utf8')
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

test('OpenClaw packaged chat keeps portable document attachments, media previews, and visible progress on the shared renderer', () => {
  assert.match(openclawChatSource, /OPENCLAW_DOCUMENT_EXTENSIONS/)
  assert.match(openclawChatSource, /createOpenClawDocumentAttachmentFromFile/)
  assert.match(openclawChatSource, /\[DOCUMENT_ATTACHMENT_CONTEXT\]/)
  assert.match(openclawChatSource, /MediaPath\/MediaPaths/)
  assert.match(openclawChatSource, /function openOpenClawPdfPreview/)
  assert.match(openclawChatSource, /function showLightbox/)
  assert.match(openclawChatSource, /function isOpenClawGatewayMediaRoute/)
  assert.match(openclawChatSource, /loadOpenclawGatewayMedia/)
  assert.match(openclawChatSource, /getOpenClawVisibleProgressFromEvent/)
  assert.match(tauriApiSource, /openclaw_load_gateway_media/)
  assert.match(openclawHistorySource, /pub async fn openclaw_load_gateway_media/)
  assert.match(tauriLibSource, /openclaw_history::openclaw_load_gateway_media/)
  assert.match(openclawWsClientSource, /params\.attachments = attachments/)
  assert.match(buildDesktopSource, /resources\/runtime\/openclaw\/\*\*\/*/)
  assert.match(buildDesktopSource, /data\\\.openclaw/)
})

test('OpenClaw MiniMax test configuration is available in Tauri development mode', () => {
  assert.match(testBuildModeSource, /export function isDevelopmentMode\(\)[\s\S]*?import\.meta\.env\?\.DEV === true/)
  const panelVisibility = modelPageSource.match(/function shouldShowMiniMaxTestPanel[\s\S]*?\n\}/)?.[0] || ''
  assert.match(panelVisibility, /isDevelopmentMode\(\) \|\| isMiniMaxOnlyMode\(\) \|\| isTestBuildMode\(\)/)
  assert.match(modelPageSource, /免登录测试模式/)
  assert.match(modelPageSource, /id="minimax-test-api-key"/)
})

test('Claude opens user-approved local files through a portable scoped desktop bridge', () => {
  assert.match(claudePanelServerSource, /SUPERCLAW_LOCAL_DESKTOP_TOOLS/)
  assert.match(claudePanelServerSource, /ensurePortableLocalDesktopMcp/)
  assert.match(claudePanelServerSource, /const mcpConfigPath = path\.join\(CLAUDE_RUNTIME_CONFIG_DIR, "\.claude\.json"\)/)
  assert.match(claudePanelServerSource, /args\.push\("--mcp-config", path\.join\(CLAUDE_RUNTIME_CONFIG_DIR, "\.claude\.json"\)\)/)
  assert.match(claudePanelServerSource, /args\.push\("--mcp-config"[\s\S]*?if \(!allowBrowserAutomation\) \{[\s\S]*?args\.push\("--strict-mcp-config"\)/)
  assert.match(claudePanelServerSource, /function removeAccidentalHomeMcpEntries\(names\)/)
  assert.match(claudePanelServerSource, /removeAccidentalHomeMcpEntries\(\["superclaw_web_research", "superclaw_local_desktop"\]\)/)
  assert.match(claudePanelServerSource, /Register the portable bridge before the UI accepts a run/)
  assert.match(claudePanelServerSource, /ensurePortableWebResearchMcp\(\);[\s\S]*ensurePortableLocalDesktopMcp\(\{/)
  assert.match(claudePanelServerSource, /enabled: false,[\s\S]*allowedRoots: \[\]/)
  assert.match(claudePanelServerSource, /allowedRoots: \[UPLOAD_DIR, \.\.\.desktopOpenRoots\]/)
  assert.match(claudePanelServerSource, /authorizationGrant === "file"/)
  assert.match(claudePanelServerSource, /function isExplicitAttachedFileOpenRequest\(prompt, attachments\)/)
  assert.match(claudePanelServerSource, /function findNamedUploadedFilesForOpenRequest\(prompt\)/)
  assert.match(claudePanelServerSource, /\[Approved local file open request\]/)
  assert.match(claudePanelServerSource, /Do not ask the user to repeat its path or grant another permission\./)
  assert.match(claudePanelServerSource, /function writePortableLocalDesktopOpenState\(options = \{\}\)/)
  assert.match(claudePanelServerSource, /local-desktop-open\.json/)
  assert.match(claudePanelServerSource, /writePortableLocalDesktopOpenState\(\{\s*enabled: desktopOpenEnabled,[\s\S]*?allowedRoots: \[UPLOAD_DIR, \.\.\.desktopOpenRoots\],/)
  assert.match(claudePanelServerSource, /requestedNames\.has\(entry\.name\.toLowerCase\(\)\)/)
  assert.match(claudePanelServerSource, /const approvedLocalFiles = \[\.\.\.runAttachments\]/)
  assert.match(claudePanelServerSource, /const desktopOpenRoots = \[cwd, \.\.\.approvedLocalFiles\.map\(\(item\) => path\.dirname\(item\.path\)\)\]/)
  assert.match(claudePanelServerSource, /SUPERCLAW_CLAUDE_DESKTOP_OPEN_ROOTS: JSON\.stringify\(desktopOpenRoots\)/)
  assert.match(claudePanelServerSource, /authorizationGrant === "file" \|\| attachedFileOpenRequested/)
  assert.match(claudePanelServerSource, /The user directly requested opening these uploaded files/)
  assert.match(claudePanelServerSource, /This run may use only mcp__superclaw_local_desktop__open_local_file/)
  assert.match(claudePanelServerSource, /SUPERCLAW_CLAUDE_DESKTOP_OPEN_ENABLED/)
  assert.match(claudePanelSource, /function isDesktopOpenTask/)
  assert.match(claudePanelSource, /needsDesktopOpenAuthorization/)
  assert.match(claudePanelSource, /type: "file"/)
  assert.match(claudeLocalDesktopMcpSource, /open_local_file/)
  assert.match(claudeLocalDesktopMcpSource, /file_path: z\.string\(\)\.min\(1\)\.max\(4096\)\.optional\(\)/)
  assert.match(claudeLocalDesktopMcpSource, /resolveApprovedTarget\(rawPath \|\| filePath\)/)
  assert.match(claudeLocalDesktopMcpSource, /SUPERCLAW_CLAUDE_DESKTOP_OPEN_ENABLED !== "1"/)
  assert.match(claudeLocalDesktopMcpSource, /SUPERCLAW_CLAUDE_DESKTOP_OPEN_ROOTS/)
  assert.match(claudeLocalDesktopMcpSource, /function findUniqueApprovedBasename\(fileName, roots\)/)
  assert.match(claudeLocalDesktopMcpSource, /LOCAL_OPEN_STATE_PATH/)
  assert.match(claudeLocalDesktopMcpSource, /function readPortableOpenState\(\)/)
  assert.match(claudeLocalDesktopMcpSource, /findUniqueApprovedBasename\(path\.basename\(requested\), roots\)/)
  assert.match(claudeLocalDesktopMcpSource, /if \(matches\.length !== 1\) return ""/)
  assert.match(claudeLocalDesktopMcpSource, /outside the approved project and upload folders/)
  assert.match(claudeLocalDesktopMcpSource, /explorer\.exe/)
  assert.doesNotMatch(claudeLocalDesktopMcpSource, /C:\\\\Users|C:\\\\tmp/)
  assert.match(buildDesktopSource, /runtime\\claude-panel\\local-desktop-mcp\.js/)
  assert.match(buildDesktopSource, /Packaged Claude local desktop MCP/)
})

test('OpenClaw MiniMax Token Plan configuration also powers packaged web search', () => {
  const minimaxConfigSource = readFileSync('src/lib/minimax-test-config.js', 'utf8')
  assert.match(minimaxConfigSource, /cfg\.plugins\.entries\[PROVIDER_ID\]/)
  assert.match(minimaxConfigSource, /webSearch:\s*\{/)
  assert.match(minimaxConfigSource, /\.\.\.\(apiKey \? \{ apiKey \} : \{\}\)/)
  assert.match(minimaxConfigSource, /region: config\.baseUrl\.includes\('api\.minimaxi\.com'\) \? 'cn' : 'global'/)
  assert.match(minimaxConfigSource, /cfg\.tools\.web\.search\.provider = PROVIDER_ID/)
  assert.doesNotMatch(minimaxConfigSource, /C:\\\\Users|C:\\\\tmp/)
})

test('OpenClaw shared OCR plugin is sourced and packaged with the same relative runtime layout', () => {
  const ocrPluginSource = readFileSync('src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-ocr/index.js', 'utf8')
  assert.match(buildDesktopSource, /"superclaw-ocr"/)
  assert.match(
    buildDesktopSource,
    /runtime\\openclaw\\node_modules\\@qingchencloud\\openclaw-zh\\dist\\extensions\\superclaw-ocr\\openclaw\.plugin\.json/,
  )
  assert.match(openclawCommandsSource, /"superclaw-ocr"/)
  assert.match(modelPageSource, /superclaw_ocr/)
  assert.match(ocrPluginSource, /path\.join\(cursor, "ocr"\)/)
  assert.match(ocrPluginSource, /ocr-runner\.cjs/)
  assert.match(ocrPluginSource, /tessdata/)
  assert.match(ocrPluginSource, /systemInstallRequired: false/)
  assert.doesNotMatch(ocrPluginSource, /C:\\Users|C:\\tmp/)
})

test('OpenClaw video skills receive bundled FFmpeg paths in dev and packaged runtimes', () => {
  assert.match(openclawCommandsSource, /pub fn bundled_video_tools_ffmpeg_bin_dir\(\)/)
  assert.match(openclawCommandsSource, /join\("video-tools"\)[\s\S]*?join\("ffmpeg"\)[\s\S]*?join\("bin"\)/)
  assert.match(openclawUtilsSource, /SUPERCLAW_FFMPEG_PATH/)
  assert.match(openclawUtilsSource, /SUPERCLAW_FFPROBE_PATH/)
  assert.match(devApiSource, /function resolveOpenClawVideoTools\(\)/)
  assert.match(devApiSource, /PATH: \[videoTools\?\.binDir, process\.env\.PATH \|\| ''\]/)
  assert.match(devApiSource, /SUPERCLAW_FFMPEG_PATH: videoTools\.ffmpeg/)
  assert.match(devApiSource, /SUPERCLAW_FFPROBE_PATH: videoTools\.ffprobe/)
  assert.match(buildDesktopSource, /runtime\\video-tools\\ffmpeg\\bin\\ffmpeg\.exe/)
  assert.match(buildDesktopSource, /runtime\\video-tools\\ffmpeg\\bin\\ffprobe\.exe/)
})

test('OpenClaw portable upload supports guarded CDP file drops in dev and packaged runtimes', () => {
  assert.match(openclawUploadPatchSource, /BROWSER_UPLOAD_MODES = \["auto", "input", "drop"\]/)
  assert.match(openclawUploadPatchSource, /async function dropFilesViaCdp/)
  assert.match(openclawUploadPatchSource, /withPlaywrightPageCdpSession\(page/)
  assert.match(openclawUploadPatchSource, /session\.send\("Input\.dispatchDragEvent"/)
  assert.match(openclawUploadPatchSource, /\["dragEnter", "dragOver", "drop"\]/)
  assert.match(openclawUploadPatchSource, /resolveStrictExistingUploadPaths/)
  assert.match(openclawUploadPatchSource, /existing-session profiles/)
  assert.doesNotMatch(openclawUploadPatchSource, /C:\\Users|C:\\tmp/)
  assert.match(tauriConfigSource, /beforeDevCommand[^\n]+patch-openclaw-upload-runtime\.mjs/)
  assert.match(tauriConfigSource, /beforeBuildCommand[^\n]+patch-openclaw-upload-runtime\.mjs/)
  assert.match(buildDesktopSource, /Applying portable OpenClaw upload patch/)
  assert.match(buildDesktopSource, /patch-openclaw-upload-runtime\.mjs/)
})

test('OpenClaw streamed replies follow the bottom unless the user deliberately scrolls upward', () => {
  assert.match(openclawChatSource, /_scrollPointerActive/)
  assert.match(openclawChatSource, /_scrollPointerActive && scrollTop < _lastScrollTop - 2/)
  assert.match(openclawChatSource, /\['ArrowUp', 'PageUp', 'Home'\]\.includes\(e\.key\)/)
  assert.match(openclawChatSource, /new MutationObserver\(\(\) => \{[\s\S]*?scrollToBottom\(\)/)
  assert.match(openclawChatSource, /new ResizeObserver\(\(\) => scrollToBottom\(\)\)/)
  assert.match(openclawChatSource, /const followBottom = \(\) => \{[\s\S]*?distance \* 0\.22/)
  assert.match(openclawChatSource, /_scrollFrame = requestAnimationFrame\(followBottom\)/)
  assert.match(openclawChatSource, /prefers-reduced-motion: reduce/)
  assert.match(openclawChatSource, /_messagesMutationObserver\?\.disconnect\(\)/)
  assert.match(openclawChatSource, /_messageResizeObserver\?\.disconnect\(\)/)
  const sendBlock = openclawChatSource.match(/async function doSend\([\s\S]*?function buildAttachmentTriggeredPrompt/)?.[0] || ''
  assert.match(sendBlock, /_autoScrollEnabled = true/)
  assert.match(sendBlock, /showTyping\(true\)[\s\S]*?scrollToBottom\(true\)/)
  assert.match(openclawChatSource, /function doRender\(\)[\s\S]*?scrollToBottom\(\)/)
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

test('OpenClaw process cards use persisted shared frontend state in dev and packaged builds', () => {
  const snapshotBlock = openclawChatSource.match(/function collectOpenClawVisibleMessagesForSnapshot\([\s\S]*?function normalizeOpenClawSnapshotMessage/)?.[0] || ''
  const cacheBlock = openclawChatSource.match(/function cachedHistoryMessage\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(snapshotBlock, /collectOpenClawExecutionTimelineFromBubble\(bubble\)/)
  assert.match(openclawChatSource, /function collectOpenClawExecutionTimelineFromBubble\(bubble\)/)
  assert.match(cacheBlock, /executionTimeline: Array\.isArray\(m\.executionTimeline\)/)
  assert.match(openclawMessageDbSource, /'executionTimeline'/)
  assert.match(openclawChatSource, /executionTimeline: msg\.executionTimeline \|\| \[\]/)
})

test('packaged OpenClaw settles a terminal native tool-only run instead of leaving typing active', () => {
  assert.match(openclawChatSource, /api\.readOpenclawRawHistory\(_sessionKey, 300\)/)
  assert.match(openclawChatSource, /function completeOpenClawTerminalToolOnlyRun\(rawHistory = \{\}\)/)
  assert.match(openclawChatSource, /clearOpenClawGenerationState\('native-terminal-tool-only'/)
  assert.match(openclawChatSource, /normalizeOpenClawPromptFingerprint\(latestUserText\)/)
  assert.match(openclawHistorySource, /"sessionStatus"/)
})

test('packaged OpenClaw renders native tool progress before the terminal reply exists', () => {
  const liveProgress = openclawChatSource.match(/function hydrateOpenClawLiveHistoryProgress\([\s\S]*?\n\}/)?.[0] || ''
  const poller = openclawChatSource.match(/function startOpenClawProgressHistoryPolling\([\s\S]*?function isOpenClawNativeSessionTerminal/)?.[0] || ''

  assert.match(liveProgress, /isOpenClawToolUseMessage\(message\)/)
  assert.match(liveProgress, /renderOpenClawLiveTimeline\(\)/)
  assert.match(poller, /hydrateOpenClawLiveHistoryProgress\(rawMessages\)/)
  assert.match(poller, /hydrateOpenClawLiveHistoryProgress\(messages\)/)
})

test('packaged OpenClaw keeps long tool runs active until portable history has a terminal reply', () => {
  const completion = openclawChatSource.match(/function completeOpenClawCurrentDraftFromLatestHistory[\s\S]*?function mergeHistoryIntoCurrentMessages/)?.[0] || ''
  const timelineAttach = openclawChatSource.match(/function attachOpenClawExecutionTimeline[\s\S]*?function hydrateOpenClawRunTimelineFromTools/)?.[0] || ''

  assert.match(openclawChatSource, /function isOpenClawNativeTerminalAssistant/)
  assert.match(completion, /_openClawAuthoritativeTerminal/)
  assert.match(completion, /requiresNativeTerminal/)
  assert.match(timelineAttach, /normalizeOpenClawHistoryRecord\(rawMessage\)/)
  assert.match(timelineAttach, /message\.role === 'tool' \|\| message\.role === 'toolResult'/)
  assert.doesNotMatch(timelineAttach, /C:\\Users|C:\\tmp/)
})

test('packaged OpenClaw final-history recovery ignores timeline-only bubble text', () => {
  const recoverableDraft = openclawChatSource.match(/function isRecoverableOpenClawCurrentDraft\(\)[\s\S]*?\n\}/)?.[0] || ''

  assert.match(recoverableDraft, /data-openclaw-assistant-content/)
  assert.match(recoverableDraft, /!assistantContent \|\|/)
  assert.doesNotMatch(recoverableDraft, /getOpenClawAssistantContentText\(_currentAiBubble\)/)
})

test('packaged OpenClaw recovers the native terminal reply from the portable trajectory log', () => {
  assert.match(openclawHistorySource, /format!\("\{session_id\}\.trajectory\.jsonl"\)/)
  assert.match(openclawHistorySource, /fn trajectory_messages\(source: &str\)/)
  assert.match(openclawHistorySource, /fn successful_tool_only_terminal_messages\(messages: &\[Value\], trajectory_source: &str\)/)
  assert.match(openclawHistorySource, /Some\("session\.ended"\)/)
  assert.match(openclawHistorySource, /Some\("success"\)/)
  assert.match(openclawHistorySource, /OpenClaw 原生任务已执行完成/)
  assert.match(openclawHistorySource, /successful_tool_only_terminal_messages\(&messages, &trajectory_source\)/)
  assert.match(openclawHistorySource, /data\.get\("assistantTexts"\)/)
  assert.match(openclawHistorySource, /"trajectoryFinal": true/)
  assert.match(openclawHistorySource, /messages\.push\(candidate\)/)
  assert.doesNotMatch(openclawHistorySource, /C:\\\\Users|C:\\\\tmp/)
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

test('Hermes assistant markdown renders safe raster images but never executable image URLs', () => {
  const html = renderAgentMessageContentForRegression([
    '![天气图](https://example.com/weather.png)',
    '![unsafe](javascript:alert(1))',
    '![inline](data:image/png;base64,aGVsbG8=)',
  ].join('\n\n'))

  assert.match(html, /<img class="agent-message-markdown-image" src="https:\/\/example\.com\/weather\.png" alt="天气图"/)
  assert.match(html, /src="data:image\/png;base64,aGVsbG8="/)
  assert.doesNotMatch(html, /src="javascript:/i)
  assert.match(html, /agent-message-image-ref">unsafe<\/span>/)
})

test('Hermes assistant markdown preserves soft paragraph breaks inside the chat bubble', () => {
  const html = renderAgentMessageContentForRegression('first line\nsecond line\n\nthird paragraph')

  assert.match(html, /first line<br>second line/)
  assert.match(html, /<p>third paragraph<\/p>/)
})

test('Hermes media-return requests instruct the native agent to use the current-chat attachment tool', () => {
  const intentBlock = hermesChatSource.match(/function buildIntentTriggeredToolInstructions\(text\) \{[\s\S]*?function stripFirstHttpUrl/)?.[0] || ''

  assert.match(intentBlock, /MEDIA_RETURN_TRIGGER/)
  assert.match(intentBlock, /call superclaw_return_media with that verified absolute path/)
  assert.match(intentBlock, /attaches the image to the current SuperClaw chat automatically/)
  assert.match(intentBlock, /workspace \.shots directory/)
  assert.match(intentBlock, /do not call, retry, or discuss send_message/)
  assert.match(intentBlock, /For a sandbox image \(for example \/tmp\), call superclaw_return_media/)
  assert.match(intentBlock, /\\u751f\\u6210/)
  assert.match(intentBlock, /\\u5f53\\u524d\\u804a\\u5929/)
  assert.match(intentBlock, /\\u53d1\\u51fa\\u6765/)
  assert.match(intentBlock, /vision_analyze analyzes an image but cannot return it to chat/)
})

test('Hermes media loader accepts only its portable image roots including desktop screenshots', () => {
  const rootsBlock = assistantCommandSource.match(/fn hermes_media_roots\(\) -> Vec<PathBuf> \{[\s\S]*?^\}/m)?.[0] || ''

  assert.match(rootsBlock, /data_dir\(\)\.join\("images"\)/)
  assert.match(rootsBlock, /openclaw_dir\(\)\.join\("workspace"\)\.join\("\.shots"\)/)
  assert.match(assistantCommandSource, /MEDIA image path is outside allowed Hermes generated directories/)
})

test('Hermes keeps the internal MEDIA envelope while redacting ordinary local paths', () => {
  const mediaPath = 'C:\\Users\\demo\\SuperClaw\\resources\\data\\.openclaw\\workspace\\.shots\\capture.png'
  const output = preserveHermesMediaProtocol(
    `MEDIA: ${mediaPath}\nCreated at ${mediaPath}`,
    (visible) => visible.replace(mediaPath, '[REDACTED_PATH]'),
  )

  assert.match(output, new RegExp(`MEDIA: ${mediaPath.replace(/[\\\\.^$*+?()[\]{}|]/g, '\\$&')}`))
  assert.match(output, /Created at \[REDACTED_PATH\]/)
  assert.match(hermesStoreSource, /preserveHermesMediaProtocol\(text, \(mediaFreeText\)/)
})

test('Hermes preserves sandbox image bytes as a current-chat MEDIA_DATA attachment protocol', () => {
  const payload = 'aGVsbG8='
  const split = splitMediaProtocol(`MEDIA_DATA: image/png;base64,${payload}\n图片已返回。`)

  assert.deepEqual(split.mediaLines, [`MEDIA_DATA: image/png;base64,${payload}`])
  assert.equal(split.visibleText, '图片已返回。')
  const parserBlock = hermesChatSource.match(/function parseHermesMediaDirectiveData\(value = ''\) \{[\s\S]*?function splitHermesMediaDirectives/)?.[0] || ''
  assert.match(parserBlock, /HERMES_MEDIA_DATA_MAX_BYTES/)
  assert.match(parserBlock, /image\\\/\(\?:png\|jpe\?g\|webp\|gif\)/)
})

test('Hermes current-chat media tool stages an attachment directly from its tool completion event', () => {
  assert.match(hermesStoreSource, /function attachHermesReturnedMedia\(session, clientRequestId, evt = \{\}\)/)
  assert.match(hermesStoreSource, /toolName !== 'superclaw_return_media'/)
  assert.match(hermesStoreSource, /return mediaPath/)
  assert.match(hermesStoreSource, /message\.attachments = attachments/)
  assert.match(hermesStoreSource, /function normalizeHermesToolEventName\(eventName\)/)
  assert.match(hermesStoreSource, /if \(name === 'tool\.complete'\) return 'tool\.completed'/)
  assert.match(hermesStoreSource, /async function hydrateHermesReturnedMedia\(sessionId, clientRequestId, mediaPath\)/)
  assert.match(hermesStoreSource, /api\.loadHermesMediaImage\(path\)/)
  assert.match(hermesStoreSource, /attachment\.dataUrl = dataUrl/)
  assert.match(hermesStoreSource, /hydrateHermesReturnedMedia\(session\?\.id, clientRequestId, returnedMediaPath\)/)
  assert.match(hermesChatSource, /superclaw_return_media/)
  assert.match(assistantCommandSource, /image_cache"\)\.join\("chat-media"\)/)
  assert.match(hermesChatMediaToolSource, /Return a verified local raster image to the current SuperClaw chat turn/)
  assert.match(hermesChatMediaToolSource, /For a simple text PNG, provide the text to render directly/)
  assert.match(hermesChatMediaToolSource, /def _render_text_png\(text: str, target_dir: Path\) -> Path/)
  assert.match(hermesChatMediaToolSource, /Path\("\/tmp"\)\.resolve\(\)/)
  assert.match(hermesChatMediaToolSource, /image_cache" \/ "chat-media"/)
  assert.match(hermesCommandsSource, /"tool\.start" => "tool\.started"/)
  assert.match(hermesCommandsSource, /"tool\.complete" => "tool\.completed"/)
  assert.match(devApiSource, /if \(eventName === 'tool\.complete'\) return \{ \.\.\.evt, event: 'tool\.completed' \}/)
  assert.match(hermesApiServerSource, /result = kwargs\.get\("result", ""\)/)
  assert.match(hermesApiServerSource, /"result": result/)
  assert.match(hermesCommandsSource, /\.get\("tool_id"\)/)
  const toolEventHandler = hermesStoreSource.match(/function applyStreamToolEvent\(evt\) \{[\s\S]*?\n  \}/)?.[0] || ''
  assert.ok(
    toolEventHandler.indexOf('const session = state.sessions.find') < toolEventHandler.indexOf('attachHermesReturnedMedia(session'),
    'the assistant session must exist before a media tool completion is attached',
  )
})

test('Hermes returned chat images support a safe in-app preview in packaged and web builds', () => {
  assert.match(hermesChatSource, /data-hermes-media-preview/)
  assert.match(hermesChatSource, /function openHermesImagePreview\(image\)/)
  assert.match(hermesChatSource, /if \(!isSafeRenderableImageSrc\(src\)\) return/)
  assert.match(hermesChatSource, /event\.key === 'Escape'/)
  assert.match(hermesChatSource, /if \(event\.target === overlay\) closeHermesImagePreview\(\)/)
  assert.match(hermesChatSource, /panel\.addEventListener\('wheel'/)
  assert.match(hermesChatSource, /zoom = Math\.min\(4, Math\.max\(0\.5,/)
  assert.match(hermesChatSource, /preview\.addEventListener\('dblclick'/)
  assert.match(hermesStyleSource, /\.hm-chat-image-preview-overlay/)
  assert.match(hermesStyleSource, /cursor:\s*zoom-in/)
})

test('Hermes current-chat media return clears only this turn history without creating sidebar sessions', () => {
  assert.match(hermesStoreSource, /function isHermesCurrentChatMediaReturnRequest\(text = ''\)/)
  assert.match(hermesStoreSource, /function isHermesEphemeralMediaSession\(sessionOrId = ''\)/)
  assert.match(hermesStoreSource, /\^\(\?:media-protocol\|raw-media\|media-e2e\)-/)
  assert.match(hermesStoreSource, /!isHermesEphemeralMediaSession\(s\)/)
  assert.match(hermesStoreSource, /const visibleCached = cached\.filter\(session => !isHermesEphemeralMediaSession\(session\)\)/)
  assert.match(hermesStoreSource, /sessions: visibleCached/)
  assert.match(hermesStoreSource, /const isolateNativeMediaRun = Boolean\(opts\.isolateNativeMediaRun \|\| isHermesCurrentChatMediaReturnRequest/)
  assert.match(hermesStoreSource, /if \(isolateNativeMediaRun\) forceEmptyHistory = true/)
  assert.match(hermesStoreSource, /HERMES_MEDIA_RETURN_HARD_INSTRUCTION/)
  assert.match(hermesStoreSource, /const nativeSessionId = s\.id/)
  assert.doesNotMatch(hermesStoreSource, /hermesIsolatedMediaSessionId/)
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

test('Hermes shared markdown renderer accepts compact and full-width table delimiters', () => {
  const html = renderAgentMessageContentForRegression([
    '｜ 日期 ｜ 天气 ｜',
    '｜ -- ｜ —— ｜',
    '｜ 周一 ｜ 晴 ｜',
  ].join('\n'))

  assert.match(html, /<table class="agent-message-markdown-table">/)
  assert.match(html, /日期/)
  assert.match(html, /周一/)
  assert.doesNotMatch(html, /｜ -- ｜ —— ｜/)
})

test('Hermes final reply keeps a streamed GFM table for the shared packaged renderer', () => {
  const finalText = normalizeHermesVisibleReply([
    '## 最终结果',
    '',
    '| 项目 | 状态 |',
    '| --- | --- |',
    '| 表格 | 已保留 |',
  ].join('\n'), { userText: '请用表格展示最终结果' })
  const html = renderAgentMessageContentForRegression(finalText)

  assert.match(finalText, /\| --- \| --- \|/)
  assert.match(html, /<table class="agent-message-markdown-table">/)
  assert.match(html, /表格/)
  assert.match(html, /已保留/)
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

test('Hermes packaged and web builds route visible work narration into the execution trace', () => {
  const narration = '让我再搜一下最近的会话，看看一周具体指什么任务。'
  assert.equal(extractHermesVisibleExecutionNarration(narration), narration)
  assert.equal(stripHermesVisibleExecutionNarration(`${narration}\n\n最终结论。`, [{
    kind: 'reasoning',
    source: 'stream-visible',
    summary: narration,
  }]), '最终结论。')

  const appendBlock = hermesStoreSource.match(/function appendStreamDelta\(runSessionId, delta, clientRequestId = state\.runningClientRequestId\) \{[\s\S]*?function acceptActiveStreamEvent/)?.[0] || ''
  assert.match(appendBlock, /extractHermesVisibleExecutionNarration\(delta\)/)
  assert.match(appendBlock, /source: 'stream-visible'/)
  assert.match(hermesStoreSource, /executionTrace: msg\.executionTrace/)
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

  const doneBlock = hermesStoreSource.match(/tauriListen\('hermes-run-done'[\s\S]*?const u4 = await tauriListen/)?.[0] || ''
  assert.match(doneBlock, /applyHermesPromiseOnlyTaskGuard\(msg, currentVisibleUserPrompt\(\), runTools, clientRequestId\)/)
  assert.match(hermesStoreSource, /function\s+applyHermesPromiseOnlyTaskGuard\(/)
  const webCompletionBlock = hermesStoreSource.match(/function completeStreamRun\(runSessionId, output = '', clientRequestId = state\.runningClientRequestId\) \{[\s\S]*?function replaceStreamOutput/)?.[0] || ''
  assert.match(webCompletionBlock, /applyHermesPromiseOnlyTaskGuard\(msg, currentVisibleUserPrompt\(\), runTools, clientRequestId\)/)
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

  const doneBlock = hermesStoreSource.match(/tauriListen\('hermes-run-done'[\s\S]*?const u4 = await tauriListen/)?.[0] || ''
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
  assert.match(launcherBlock, /uv-python\\python\\python\.exe/)
  assert.match(launcherBlock, /setlocal EnableExtensions EnableDelayedExpansion/)
  assert.match(launcherBlock, /for \/d %%D in \("%SUPERCLAW_RUNTIME_DIR%uv-python\\\*"\)/)
  assert.match(launcherBlock, /PYTHON_EXE_VERSIONED/)
  assert.match(launcherBlock, /%%~fD\\python\.exe/)
  assert.match(launcherBlock, /set "PYTHON_EXE=!PYTHON_EXE_VERSIONED!"/)
  assert.match(launcherBlock, /"!PYTHON_EXE!" -m hermes_cli\.main/)
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
  assert.match(buildDesktopSource, /templates\\openclaw-workspace/)
  assert.match(buildDesktopSource, /superclaw-task-policy\\SKILL\.md/)
  assert.match(buildDesktopSource, /superclaw-ecommerce\\SKILL\.md/)
  assert.match(buildDesktopSource, /superclaw-finance\\SKILL\.md/)
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
  assert.match(streamMatchBlock, /isOpenClawEventBoundToActiveRequest\(event\)/)
  assert.match(streamMatchBlock, /return !isOpenClawGenerationActive\(\)/)
  assert.match(deltaBlock, /isOpenClawStreamIdMismatch\(payload, stableStreamId\)/)
  assert.match(finalBlock, /isOpenClawStreamIdMismatch\(payload, stableStreamId\)/)
  assert.match(finalBlock, /chooseOpenClawCompletionText\(/)
  assert.match(finalBlock, /renderCompactAssistantContent\(_currentAiText, _currentAiBubble, \{ phase: 'completed' \}\)/)
})

test('OpenClaw packaged chat accepts native agent-stream assistant deltas through the same renderer', () => {
  const adapter = openclawChatSource.match(/function normalizeOpenClawAgentChatEvent\([\s\S]*?\n\}/)?.[0] || ''
  const eventHandler = openclawChatSource.match(/function handleEvent\([\s\S]*?\n\}\n\nfunction handleChatEvent/)?.[0] || ''

  assert.match(adapter, /extractOpenClawAssistantText\(data\)/)
  assert.match(adapter, /state: isFinal \? 'final' : 'delta'/)
  assert.match(adapter, /sessionKey: payload\.sessionKey \|\| data\.sessionKey/)
  assert.match(eventHandler, /normalizeOpenClawAgentChatEvent\(payload\)/)
  assert.match(eventHandler, /handleChatEvent\(agentChatPayload, msg\.id\)/)
  assert.match(openclawChatSource, /function isOpenClawStreamIdMismatch/)
  assert.match(adapter, /_openClawIncrementalDelta: isIncrementalDelta/)
  assert.match(adapter, /_openClawRawDeltaText: streamingText/)
  assert.match(adapter, /typeof data\.deltaText === 'string'/)
  assert.match(adapter, /_openClawReplaceDelta: replaceDelta/)
  assert.match(adapter, /_openClawCumulativeMessageText: cumulativeMessageText/)
  assert.match(openclawChatSource, /function mergeOpenClawStreamingText/)
  assert.match(openclawChatSource, /_currentAiStreamRawText = mergeOpenClawStreamingText/)
  assert.match(openclawChatSource, /replace: nativeDeltaText != null \? nativeReplaceDelta : payload\._openClawReplaceDelta === true/)
  assert.match(openclawChatSource, /: \(payload\._openClawCumulativeMessageText \|\| ''\)/)
  assert.match(openclawChatSource, /typeof payload\.deltaText === 'string'/)
  assert.match(openclawChatSource, /typeof payload\.data\?\.deltaText === 'string'/)
  assert.match(openclawChatSource, /nativeDeltaText != null \? !nativeReplaceDelta/)
  assert.match(openclawChatSource, /function getChatEventSequence/)
  assert.match(openclawChatSource, /if \(payload\.state === 'delta'\)/)
  assert.match(openclawChatSource, /Some gateway builds reuse both the event id and message id/)
  assert.match(adapter, /sequence: payload\.sequence \?\? payload\.seq \?\? data\.sequence \?\? data\.seq/)
  assert.match(adapter, /_openClawSourceEventTimestamp: payload\.ts \|\| data\.ts \|\| null/)
  assert.match(openclawChatSource, /payload\._openClawIncrementalDelta === true/)
  assert.match(openclawWsClientSource, /const isOpenClawLiveStreamEvent = msg\.event === 'agent'/)
  assert.match(openclawWsClientSource, /!isOpenClawLiveStreamEvent && msg\.id && this\._seenMessageIds\.has\(msg\.id\)/)
})

test('packaged OpenClaw binds the native run and preserves the full live execution timeline', () => {
  const sendBlock = openclawChatSource.match(/async function doSend[\s\S]*?function processMessageQueue/)?.[0] || ''
  const completionBlock = openclawChatSource.match(/function completeStreamingDraftFromHistory[\s\S]*?function completeOpenClawCurrentDraftFromLatestHistory/)?.[0] || ''

  assert.match(openclawChatSource, /function getOpenClawNativeRunId/)
  assert.match(openclawChatSource, /function bindOpenClawNativeRun/)
  assert.match(sendBlock, /const sendResult = await wsClient\.chatSend/)
  assert.match(sendBlock, /bindOpenClawNativeRun\(sendResult, clientRequestId\)/)
  assert.match(openclawChatSource, /function mergeOpenClawExecutionTimelines\(\.\.\.sources\)/)
  assert.match(completionBlock, /mergeOpenClawExecutionTimelines\(_currentAiTimeline, msg\.executionTimeline\)/)
  assert.doesNotMatch(openclawChatSource, /_currentAiTimeline = _currentAiTimeline\.slice\(-80\)/)
  assert.doesNotMatch(sendBlock, /C:\\Users|C:\\tmp/)
})

test('packaged OpenClaw cannot let an earlier turn timeout close the current turn', () => {
  const doSend = openclawChatSource.match(/async function doSend[\s\S]*?function buildAttachmentTriggeredPrompt/)?.[0] || ''
  const settle = openclawChatSource.match(/async function settleOpenClawActiveRunFromWatchdog[\s\S]*?function _startResponseWatchdog/)?.[0] || ''
  const watchdog = openclawChatSource.match(/function _startResponseWatchdog[\s\S]*?function _resetWatchdogOnActivity/)?.[0] || ''

  assert.match(doSend, /_sendTimestamp = Date\.now\(\)/)
  assert.match(doSend, /clearTimeout\(_postFinalCheck\)/)
  assert.match(settle, /expectedRequestId && expectedRequestId !== _activeClientRequestId/)
  assert.match(watchdog, /if \(!requestId \|\| requestId !== _activeClientRequestId\) return/)
  assert.doesNotMatch(watchdog, /clearOpenClawGenerationState\('(?:watchdog|history)-visible-assistant'/)
  assert.match(watchdog, /idleDuration = Date\.now\(\) - \(_lastResponseActivityAt \|\| _sendTimestamp\)/)
  assert.match(openclawChatSource, /function isOpenClawResponseIdleTimedOut/)
  assert.match(watchdog, /isOpenClawResponseIdleTimedOut\(_lastResponseActivityAt, _sendTimestamp\)/)
  assert.doesNotMatch(watchdog, /Date\.now\(\) - _sendTimestamp >= OPENCLAW_ACTIVE_RUN_WATCHDOG_MS/)
  assert.match(openclawChatSource, /if \(hydrateOpenClawLiveHistoryProgress\(rawMessages\)\) _resetWatchdogOnActivity\(\)/)
  assert.match(openclawChatSource, /if \(hydrateOpenClawLiveHistoryProgress\(messages\)\) _resetWatchdogOnActivity\(\)/)
})

test('packaged OpenClaw lifecycle end recovers a durable final when chat final is delayed', () => {
  const eventHandler = openclawChatSource.match(/function handleEvent\([\s\S]*?\n\}\n\nfunction handleChatEvent/)?.[0] || ''

  assert.match(eventHandler, /recoverOpenClawAssistantFromHistoryBeforeFallback\('agent-lifecycle-end'/)
  assert.match(eventHandler, /startOpenClawProgressHistoryPolling\(\)/)
  assert.match(openclawHistorySource, /\.trajectory\.jsonl/)
})

test('packaged OpenClaw rejects a stale prior-turn final before history recovery', () => {
  const matchReason = openclawChatSource.match(/function getOpenClawStrongHistoryMatchReason\([\s\S]*?\n\}/)?.[0] || ''
  const strongCandidate = openclawChatSource.match(/function isStrongOpenClawHistoryCandidate\([\s\S]*?\n\}/)?.[0] || ''
  const eventBinding = openclawChatSource.match(/function isOpenClawEventBoundToActiveRequest[\s\S]*?function shouldIgnoreOpenClawUnboundChatEvent/)?.[0] || ''
  const unboundEvent = openclawChatSource.match(/function shouldIgnoreOpenClawUnboundChatEvent[\s\S]*?function shouldUseOpenClawEmptyReplyFallback/)?.[0] || ''

  assert.match(matchReason, /_openClawPreviousUserFingerprint !== activeRun\.userTextFingerprint/)
  assert.doesNotMatch(matchReason, /previousUserIndex'/)
  assert.match(strongCandidate, /getOpenClawMessageCreatedTime\(msg\)/)
  assert.match(eventBinding, /eventRunId === activeRequestId/)
  assert.match(unboundEvent, /!isOpenClawEventBoundToActiveRequest\(event\)/)
})

test('packaged OpenClaw does not append a prior assistant after a newer visible user', () => {
  const mergeHistory = openclawChatSource.match(/function mergeHistoryIntoCurrentMessages[\s\S]*?function clearInitialOpenClawHistoryLoadTimers/)?.[0] || ''
  const appendHistory = openclawChatSource.match(/function appendOpenClawHistoryMessage[\s\S]*?function completeStreamingDraftFromHistory/)?.[0] || ''
  const replaceDraft = openclawChatSource.match(/function replaceOpenClawPartialAssistantAfterLastUser[\s\S]*?function appendOpenClawHistoryMessage/)?.[0] || ''
  const completeDraft = openclawChatSource.match(/function completeStreamingDraftFromHistory[\s\S]*?function completeOpenClawCurrentDraftFromLatestHistory/)?.[0] || ''
  const recoverLatest = openclawChatSource.match(/function completeOpenClawCurrentDraftFromLatestHistory[\s\S]*?function mergeHistoryIntoCurrentMessages/)?.[0] || ''

  assert.match(openclawChatSource, /function getOpenClawLastVisibleUserCreatedTime\(\)/)
  assert.match(mergeHistory, /getOpenClawMessageCreatedTime\(msg\) < lastVisibleUserCreatedTime/)
  assert.ok(mergeHistory.indexOf('getOpenClawMessageCreatedTime(msg) < lastVisibleUserCreatedTime') < mergeHistory.indexOf('appendOpenClawHistoryMessage(msg)'))
  assert.match(appendHistory, /getOpenClawMessageCreatedTime\(msg\) < lastVisibleUserCreatedTime/)
  assert.match(replaceDraft, /getOpenClawMessageCreatedTime\(msg\) < lastVisibleUserCreatedTime/)
  assert.match(recoverLatest, /latestHistoryUserFingerprint !== expectedUserFingerprint/)
  assert.match(recoverLatest, /for \(let index = latestUserIndex; index < deduped\.length/)
  assert.match(completeDraft, /const historyText = sanitizeOpenClawVisibleReply\(msg\.text/)
  assert.doesNotMatch(completeDraft, /chooseBestOpenClawAssistantText\(\[_currentAiText, msg\.text\]/)
})

test('packaged OpenClaw progress events share the same active-run isolation as final replies', () => {
  const eventHandler = openclawChatSource.match(/function handleEvent\(msg\)[\s\S]*?if \(isOpenClawChatEvent\(event\)\) handleChatEvent/)?.[0] || ''

  assert.match(eventHandler, /agentSessionKey !== currentSessionKey/)
  assert.match(eventHandler, /generationActive && !isOpenClawEventBoundToActiveRequest\(payload\)/)
  assert.ok(eventHandler.indexOf('isOpenClawEventBoundToActiveRequest(payload)') < eventHandler.indexOf("if (stream === 'tool'"))
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
  assert.match(historyRecoveryBlock, /normalizeOpenClawExactShortReply\(recoveryUserText,\s*historyText\)/)
  assert.match(historyRecoveryBlock, /const visibleDraftText = finalText \|\| msg\.text/)
})

test('OpenClaw packaged identity and execution scopes are seeded for tool dispatch', () => {
  assert.match(openclawCommandsSource, /OPENCLAW_EFFECTIVE_TOOLS_PROFILE:\s*&str\s*=\s*"coding"/)
  assert.match(openclawCommandsSource, /"alsoAllow":\s*\["browser",\s*"desktop_control",\s*"skill_manager",\s*"superclaw_ocr",\s*"exec",\s*"process"\]/)
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

test('ClaudeCode packaged panel resolves and requires the bundled native CLI', () => {
  assert.match(claudeCommandsSource, /fn\s+effective_claude_cli_path\(resources:\s*&Path\)\s*->\s*PathBuf/)
  assert.match(claudeCommandsSource, /claude\.cmd/)
  assert.match(claudeCommandsSource, /windows_npm_global_prefix/)
  assert.match(claudeCommandsSource, /CLAUDE_CLI_PATH",\s*effective_claude/)
  assert.match(claudeCommandsSource, /CLAUDE_PANEL_ALLOW_RELAY_FALLBACK",\s*"0"/)
  assert.match(claudeCommandsSource, /CLAUDE_PANEL_NATIVE_REQUIRED",\s*"1"/)
})

test('ClaudeCode packaged chat executes through native Claude instead of silently using relay', () => {
  assert.match(claudeCommandsSource, /CLAUDE_PANEL_FORCE_RELAY",\s*"0"/)
  assert.match(claudeCommandsSource, /CLEAN_PANEL_RELAY_CONFIG_ENABLED",\s*"1"/)
  assert.match(claudeCommandsSource, /SUPERCLAW_PANEL_CONFIG_PATH/)
  assert.match(claudeCommandsSource, /CLAUDE_PANEL_NATIVE_REQUIRED",\s*"1"/)
  assert.match(claudePanelServerSource, /spawnClaude\(runMode\.nativeClaude\.path/)
  assert.match(claudePanelServerSource, /writeClaudeProcessEvent/)
  assert.match(claudePanelServerSource, /function anthropicToolsToOpenAi/)
  assert.match(claudePanelServerSource, /function anthropicMessageToOpenAi/)
  assert.match(claudePanelServerSource, /role:\s*"tool"[\s\S]*?tool_call_id/)
  assert.match(claudePanelServerSource, /function openAiToolCalls/)
  assert.match(claudePanelServerSource, /payload\.tools = tools/)
  assert.match(claudePanelServerSource, /type:\s*"input_json_delta"/)
  assert.match(claudePanelSource, /event === "process"/)
  assert.match(claudePanelSource, /executionProcess/)
  assert.match(claudePanelServerSource, /function ensurePortablePlaywrightMcp/)
  assert.match(claudePanelServerSource, /path\.join\(CLAUDE_RUNTIME_CONFIG_DIR, "\.claude\.json"\)/)
  assert.match(claudePanelServerSource, /playwright-core[\s\S]*?lib[\s\S]*?entry[\s\S]*?mcp\.js/)
  assert.match(claudePanelServerSource, /payload\.permissionProfile === "takeover"[\s\S]*?payload\.takeoverAccepted !== true/)
  assert.match(claudePanelSource, /takeoverAccepted:\s*requestedPermissionProfile === "takeover" && takeoverModeAccepted/)
  assert.match(buildDesktopSource, /claude-panel\\browser-output/)
  assert.match(buildDesktopSource, /claude-panel\\browser-profile/)
})

test('ClaudeCode persists supported document attachments locally before the native CLI run', () => {
  assert.match(claudePanelSource, /const attachmentAccept = "image\/\*,\.txt,\.md,\.json,\.csv,\.pdf,\.doc,\.docx,\.xls,\.xlsx/)
  assert.match(claudePanelSource, /async function uploadAttachmentFile\(file\)/)
  assert.match(claudePanelSource, /const uploaded = await uploadAttachmentFile\(file\)/)
  assert.doesNotMatch(claudePanelSource, /frontend metadata only; file content was not uploaded/)
  assert.match(claudePanelServerSource, /ALLOWED_ATTACHMENT_EXTENSIONS/)
  assert.match(claudePanelServerSource, /"\.xlsx"/)
  assert.match(claudePanelServerSource, /function isAllowedAttachment\(fileName, mimeType\)/)
  assert.match(claudePanelServerSource, /if \(!isAllowedAttachment\(item\?\.name \|\| filePath, item\?\.type\)\) continue/)
  assert.match(claudePanelServerSource, /async function createXlsxPreview\(filePath, fileName\)/)
  assert.match(claudePanelServerSource, /node_modules", "jszip"/)
  assert.match(claudePanelServerSource, /extracted spreadsheet preview/)
  assert.match(claudePanelServerSource, /The user attached local files in this turn/)
  assert.match(claudePanelServerSource, /const originalUserPrompt = prompt/)
  assert.match(claudePanelServerSource, /detectSourceGuardViolation\(originalUserPrompt\)/)
  assert.match(claudePanelServerSource, /isPathInside\(filePath, UPLOAD_DIR\)/)
  assert.match(buildDesktopSource, /runtime\\claude-panel/)
  assert.match(buildDesktopSource, /node_modules\\jszip\\lib\\index\.js/)
})

test('ClaudeCode can temporarily disable only the source guard without disabling core local safety controls', () => {
  assert.match(claudePanelServerSource, /const SOURCE_GUARD_ENABLED = process\.env\.SUPERCLAW_SOURCE_GUARD_ENABLED !== "0"/)
  assert.match(claudePanelServerSource, /if \(!SOURCE_GUARD_ENABLED\) return null/)
  assert.match(claudePanelServerSource, /if \(!SOURCE_GUARD_ENABLED\) return false/)
  assert.match(claudePanelServerSource, /if \(SOURCE_GUARD_ENABLED\) args\.push\("--append-system-prompt", SOURCE_GUARD_SYSTEM_PROMPT\)/)
  assert.match(claudeCommandsSource, /SUPERCLAW_SOURCE_GUARD_ENABLED", "0"/)
  assert.match(claudePanelServerSource, /function redact\(text\)/)
  assert.match(claudePanelServerSource, /containsSensitivePathSegment\(cwd\)/)
})

test('ClaudeCode defaults to an authorized browser automation profile in dev and packaged UI', () => {
  assert.match(claudePanelSource, /let activeMode = "browser";/)
  assert.match(claudePanelSource, /let browserModeAccepted = true;/)
  assert.match(claudePanelServerSource, /defaultPermissionProfile:\s*"browser"/)
  assert.match(claudePanelSource, /permissionProfile:\s*overrides\.permissionProfile \|\| activeMode/)
  assert.match(claudePanelSource, /browserModeRequested && browserModeConfirmed[\s\S]*?"once"/)
})

test('ClaudeCode packaged chat cannot stay pending without a timeout final state', () => {
  assert.match(claudePanelSource, /CLAUDE_RUN_IDLE_TIMEOUT_MS = 300000/)
  assert.match(claudePanelSource, /function readSse\(response, onActivity = \(\) => \{\}\)/)
  assert.match(claudePanelSource, /if \(value\?\.length\) onActivity\(\)/)
  assert.match(claudePanelSource, /const resetRunIdleTimeout = \(\) =>/)
  assert.match(claudePanelSource, /if \(runController !== currentRunController\) return/)
  assert.match(claudePanelSource, /runTimedOut\s*=\s*true/)
  assert.match(claudePanelSource, /currentRunController\.abort\(\)/)
  assert.match(claudePanelSource, /连续 300 秒未收到任何执行进度或回复/)

  assert.match(claudePanelSource, /if \(error\.name === "AbortError" && runTimedOut\)/)
  assert.match(claudePanelSource, /setRunState\("error",\s*"Request timed out"\)/)
  assert.match(claudePanelSource, /appendActiveRunConversationMessage\("error",\s*"Request timed out"/)
  assert.match(claudePanelSource, /clearTimeout\(runIdleTimeoutTimer\)/)
  assert.match(claudePanelSource, /const sawFinalEvent = await readSse\(response, resetRunIdleTimeout\)/)
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

  const startRunBlock = claudePanelSource.match(/async function startRun\(prompt, overrides = \{\}\)[\s\S]*?const currentRunController = new AbortController\(\)/)?.[0] || ''
  assert.match(startRunBlock, /buildClaudeRunBlockingConfigMessageStable\(\)/)
  assert.match(startRunBlock, /setRunState\("error",\s*"Configuration incomplete"\)/)
  assert.match(startRunBlock, /addMessage\("error",\s*"Configuration incomplete"/)
  assert.match(startRunBlock, /updateCurrentConversation\(\{\s*status:\s*"\\u8fd0\\u884c\\u5f02\\u5e38"/)
  assert.match(startRunBlock, /return;[\s\S]*?const currentRunController = new AbortController\(\)/)
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
  assert.match(claudePanelSource, /const source = String\(codeText \|\| ""\)/)
  assert.match(claudePanelSource, /code\.textContent\s*=\s*source/)
  assert.doesNotMatch(rendererBlock, /innerHTML\s*=\s*finalText/)
  assert.doesNotMatch(rendererBlock, /innerHTML\s*=\s*value/)
  assert.doesNotMatch(collapseBlock, /codeBlockCount\s*>?=/)
  assert.doesNotMatch(spacingBlock, /compactPanelBulletSections\(normalized\)/)
  assert.doesNotMatch(spacingBlock, /\[代码块已折叠\]/)
})

test('ClaudeCode packaged panel renders markdown tables as safe responsive tables', () => {
  assert.match(claudePanelSource, /function\s+splitClaudeMarkdownTableRow\(/)
  assert.match(claudePanelSource, /function\s+isClaudeMarkdownTableDivider\(/)
  assert.match(claudePanelSource, /function\s+appendClaudeMarkdownTable\(/)
  assert.match(claudePanelSource, /createElement\("table"\)/)
  assert.match(claudePanelSource, /createElement\("thead"\)/)
  assert.match(claudePanelSource, /createElement\("tbody"\)/)
  assert.match(claudePanelSource, /appendMarkdownFragment\(cell,\s*renderClaudeMarkdownInline/)
  assert.match(claudePanelStylesSource, /\.claude-markdown-table-wrap\s*\{[\s\S]*?overflow-x:\s*auto/)
  assert.match(claudePanelStylesSource, /\.claude-markdown-table\s*\{/)

  const rendererBlock = claudePanelSource.match(/function renderClaudeMarkdownBlocks[\s\S]*?function renderClaudeAgentMessageContent/)?.[0] || ''
  assert.match(rendererBlock, /if \(codeFence\)[\s\S]*?continue;/)
  assert.match(rendererBlock, /isClaudeMarkdownTableDivider\(dividerCells\)/)
  assert.doesNotMatch(rendererBlock, /innerHTML\s*=\s*(?:rawLine|header|rowCells|finalText|value)/)

  const parserStart = claudePanelSource.indexOf('function splitClaudeMarkdownTableRow')
  const parserEnd = claudePanelSource.indexOf('function appendClaudeMarkdownTable', parserStart)
  const parserSource = `${claudePanelSource.slice(parserStart, parserEnd)}\nmodule.exports = { splitClaudeMarkdownTableRow, isClaudeMarkdownTableDivider };`
  const sandbox = { module: { exports: {} } }
  vm.createContext(sandbox)
  vm.runInContext(parserSource, sandbox)
  const { splitClaudeMarkdownTableRow, isClaudeMarkdownTableDivider } = sandbox.module.exports
  assert.equal(JSON.stringify(splitClaudeMarkdownTableRow('| 日期 | 天气 | 气温 | 风力风向 |')), JSON.stringify(['日期', '天气', '气温', '风力风向']))
  assert.equal(isClaudeMarkdownTableDivider(splitClaudeMarkdownTableRow('|---|---|---|---|')), true)
  assert.equal(isClaudeMarkdownTableDivider(splitClaudeMarkdownTableRow('| 今天 | 阴转中雨 | 26-34C | 东北风 |')), false)
  assert.match(rendererBlock, /while \(dividerIndex < lines\.length && !String\(lines\[dividerIndex\]/)
  assert.match(rendererBlock, /while \(rowIndex < lines\.length && !String\(lines\[rowIndex\]/)
})

test('ClaudeCode code blocks place code below the header and copy only their own source', () => {
  const codeBlock = claudePanelSource.match(/function appendClaudeCodeBlock[\s\S]*?function splitClaudeMarkdownTableRow/)?.[0] || ''
  assert.match(codeBlock, /wrapper\.append\(header, pre\)/)
  assert.match(codeBlock, /header\.append\(label, copyButton\)/)
  assert.match(codeBlock, /copyText\(source\)/)
  assert.match(codeBlock, /aria-label", "复制代码"/)
  assert.match(claudePanelStylesSource, /\.claude-code-header\s*\{[\s\S]*?justify-content:\s*space-between/)
  assert.match(claudePanelStylesSource, /\.claude-code-content[\s\S]*?margin:\s*0/)
})

test('ClaudeCode assistant bubbles use a responsive percentage max width', () => {
  assert.match(claudePanelStylesSource, /message-row\.assistant > \.message[\s\S]*?max-width:\s*70%\s*!important/)
  assert.match(claudePanelStylesSource, /@media \(max-width:\s*760px\)[\s\S]*?message-row\.assistant > \.message[\s\S]*?max-width:\s*90%\s*!important/)
})

test('packaged ClaudeCode uses the same searchable extension installer and native skill path as dev', () => {
  const extensionInstallerBlock = claudePanelServerSource.slice(
    claudePanelServerSource.indexOf('function runPortableClaudeCommand'),
    claudePanelServerSource.indexOf('function resolvePortableClaudeCommand')
  )
  assert.match(claudePanelHtmlSource, /id="extensionSearchInput"/)
  assert.match(claudePanelHtmlSource, /id="extensionSearchResults"/)
  assert.match(claudePanelSource, /fetch\("\/api\/extensions\/search"/)
  assert.match(claudePanelSource, /fetch\("\/api\/extensions\/install"/)
  assert.match(claudePanelServerSource, /plugin", "list", "--available", "--json"/)
  assert.match(claudePanelServerSource, /function recoverEmptyPluginInstallTarget\(errorOutput, candidate\)/)
  assert.match(claudePanelServerSource, /const isVersionTarget = path\.dirname\(target\) === candidateRoot/)
  assert.match(claudePanelServerSource, /entries\.length !== 0\) return false/)
  assert.match(claudePanelServerSource, /path\.basename\(temporarySource\)\.startsWith\("temp_local_"\)/)
  assert.match(claudePanelServerSource, /async function installPortableMarketplacePlugin\(pluginId, candidate\)/)
  assert.match(claudePanelServerSource, /installPortableMarketplacePlugin\(pluginId, candidate\)/)
  assert.match(claudePanelServerSource, /安装命令已结束，但 Claude Code 已安装列表中没有找到该能力/)
  assert.match(claudePanelServerSource, /path\.join\(CLAUDE_RUNTIME_CONFIG_DIR, "skills"\)/)
  assert.match(claudeCommandsSource, /home\.join\("claude-config"\)\.join\("skills"\)/)
  assert.doesNotMatch(extensionInstallerBlock, /C:\\\\Users\\\\ZXKJ|C:\\\\tmp/)
})

test('ClaudeCode packaged panel cache-busts the matching markdown script and styles', () => {
  assert.match(claudePanelHtmlSource, /styles\.css\?v=20260716-claude-history1/)
  assert.match(claudePanelHtmlSource, /app\.js\?v=20260716-claude-history1/)
})

test('ClaudeCode project refresh preserves portable conversation messages and native session ids', () => {
  const renderProjectOptionsBlock = claudePanelSource.match(
    /function renderProjectOptions\(projects\) \{[\s\S]*?\n\}/
  )?.[0] || ''
  assert.match(renderProjectOptionsBlock, /syncProjectConversationCards\(projects \|\| \[\]\)/)
  assert.doesNotMatch(renderProjectOptionsBlock, /conversations\s*=\s*conversations\.filter/)
  assert.doesNotMatch(renderProjectOptionsBlock, /saveConversations\(/)
  assert.match(claudePanelSource, /Conversation history must remain durable/)
})

test('ClaudeCode follow-up prompts never create prompt-named projects or reset the native session', () => {
  const autoProjectBlock = claudePanelSource.match(
    /function shouldAutoCreateProjectForPrompt\(overrides = \{\}\) \{[\s\S]*?\n\}/
  )?.[0] || ''
  assert.match(autoProjectBlock, /if \(projectSelect\.value\) return false/)
  assert.match(autoProjectBlock, /return !activeConversation/)
  assert.doesNotMatch(autoProjectBlock, /isManagedProjectPath\(selected\)/)
  assert.match(claudePanelSource, /const resumeSessionId = String\(overrides\.resumeSessionId \|\| activeConversation\?\.nativeSessionId \|\| ""\)\.trim\(\)/)
})

test('ClaudeCode left rail keeps scrolling while hiding its scrollbar with symmetric insets', () => {
  assert.match(claudePanelStylesSource, /\.context-panel\s*\{[\s\S]*?padding:\s*20px 16px 24px/)
  assert.match(claudePanelStylesSource, /\.context-panel\s*\{[\s\S]*?scrollbar-width:\s*none/)
  assert.match(claudePanelStylesSource, /\.context-panel::\-webkit-scrollbar,[\s\S]*?display:\s*none/)
  assert.match(claudePanelStylesSource, /\.conversation-list\s*\{[\s\S]*?padding-inline:\s*0/)
})

test('ClaudeCode fullscreen intro can be persistently disabled in dev and packaged UI', () => {
  assert.match(claudePanelHtmlSource, /id="introDontShow"[^>]*type="checkbox"/)
  assert.match(claudePanelHtmlSource, /<span>不再显示<\/span>/)
  assert.match(claudePanelSource, /INTRO_DISABLED_KEY = "superclaw_claude_intro_disabled"/)
  assert.match(claudePanelSource, /localStorage\.setItem\(INTRO_DISABLED_KEY, "1"\)/)
  assert.match(claudePanelSource, /if \(disabled\) \{[\s\S]*?hideIntroOverlay\(\);[\s\S]*?return Promise\.resolve\(\)/)
})

test('ClaudeCode permission requests use one accessible bottom sheet instead of inline chat cards', () => {
  assert.match(claudePanelHtmlSource, /id="toolAuthorizationSheet"[^>]*role="dialog"[^>]*aria-modal="true"/)
  assert.match(claudePanelHtmlSource, /id="toolAuthorizationTitle"/)
  assert.match(claudePanelHtmlSource, /data-tool-auth="once"/)
  assert.match(claudePanelHtmlSource, /data-tool-auth="always"/)
  assert.match(claudePanelHtmlSource, /data-tool-auth="deny"/)
  assert.match(claudePanelSource, /function authorizationPresentation\(type\)/)
  assert.match(claudePanelSource, /browser:[\s\S]*?file:[\s\S]*?command:[\s\S]*?install:[\s\S]*?sensitive:/)
  assert.match(claudePanelSource, /function openToolAuthorizationSheet\(type\)/)
  assert.match(claudePanelSource, /pendingToolAuthorization = \{ sheet: toolAuthorizationSheet, text, type, task \}/)
  assert.match(claudePanelSource, /toolAuthorizationSheet\?\.addEventListener\("click"/)
  assert.doesNotMatch(claudePanelSource, /createElement\("div"\)[\s\S]{0,120}tool-authorization-card/)
  assert.doesNotMatch(claudePanelStylesSource, /\.tool-authorization-card\s*\{/)
  assert.match(claudePanelStylesSource, /\.tool-authorization-sheet\s*\{[\s\S]*?position:\s*fixed[\s\S]*?align-items:\s*end/)
  assert.match(claudePanelStylesSource, /\.tool-authorization-panel\s*\{[\s\S]*?width:\s*min\(680px/)
})

test('ClaudeCode authorization resumes the original task without a user permission message', () => {
  assert.match(claudePanelSource, /function scheduleAuthorizationContinuation\(task, authorizationType, choice\)/)
  assert.match(claudePanelSource, /authorizationContinuation:\s*true/)
  assert.match(claudePanelSource, /authorizationOriginalUserMessageRecorded:\s*task\.userMessageRecorded === true/)
  assert.match(claudePanelSource, /const resumeSessionId = String\(conversation\?\.nativeSessionId \|\| ""\)\.trim\(\)/)
  assert.match(claudePanelSource, /continueSession:\s*Boolean\(resumeSessionId\)/)
  assert.match(claudePanelSource, /resumeSessionId:\s*resumeSessionId \|\| undefined/)
  assert.match(claudePanelSource, /authorizationGrant:\s*authorizationType/)
  assert.match(claudePanelSource, /userMessageRecorded:\s*true/)
  assert.match(claudePanelSource, /userMessageRecorded:\s*false/)
  assert.match(claudePanelSource, /if \(!authorizationOriginalUserMessageRecorded\) \{[\s\S]*?appendActiveRunConversationMessage\("user"/)
  assert.match(claudePanelSource, /const resumeSessionId = String\(overrides\.resumeSessionId \|\| activeConversation\?\.nativeSessionId \|\| ""\)\.trim\(\)/)
  assert.match(claudePanelSource, /delete requestOverrides\.authorizationOriginalUserMessageRecorded/)
  assert.match(claudePanelSource, /delete requestOverrides\.resumeSessionId/)
  assert.doesNotMatch(claudePanelSource, /function browserAuthorizationPrompt\(/)
  assert.doesNotMatch(claudePanelSource, /function genericAuthorizationPrompt\(/)
  assert.doesNotMatch(claudePanelSource, /startRun\(nextPrompt/)
  assert.match(claudePanelSource, /if \(attemptCount >= 1\)[\s\S]*?authorizationLoopStopped/)
  assert.match(claudePanelSource, /alwaysButton\.hidden = type !== "browser"/)
  assert.match(claudePanelSource, /persistentChoice = choice === "always" && authorizationType === "browser"/)
  assert.match(claudePanelServerSource, /function authorizationGrantSystemPrompt\(type, scope = "once"\)/)
  assert.match(claudePanelServerSource, /用户已通过 SuperClaw 外部授权面板完成授权；这不是一条新的聊天消息/)
  assert.match(claudePanelServerSource, /const preapprovedTools = new Set/)
  assert.match(claudePanelServerSource, /args\.push\("--allowedTools", Array\.from\(preapprovedTools\)\.join\(","\)\)/)
})

test('ClaudeCode command authorization reuses native Bash with portable runtimes', () => {
  assert.match(claudePanelSource, /function isExcelEditTask\(text\)/)
  assert.match(claudePanelSource, /另存\|保存\|复制\|新建/)
  assert.match(claudePanelSource, /(?:excel|\\\.xlsx\?\\b|表格\(\?:文件\)\?\|工作簿|单元格|csv\\b)/i)
  assert.match(claudePanelSource, /if \(isExcelEditTask\(value\)\) return true;/)
  assert.match(claudePanelSource, /function isExplicitCommandTask\(text\)/)
  assert.match(claudePanelSource, /继续\|接着/)
  assert.match(claudePanelSource, /function isCommandContinuation\(prompt\)/)
  assert.match(claudePanelSource, /conversation\?\.lastToolProfile === "command"/)
  assert.match(claudePanelSource, /function needsCommandAuthorization\(prompt, overrides, permissionConfig\)/)
  assert.match(claudePanelSource, /isExplicitCommandTask\(prompt\) \|\| isCommandContinuation\(prompt\)/)
  assert.match(claudePanelSource, /openToolAuthorizationSheet\("command"\)/)
  assert.match(claudePanelSource, /if \(authorizationType === "command"\) \{[\s\S]*?overrides\.toolProfile = "command";[\s\S]*?overrides\.riskAccepted = true;/)
  assert.match(claudePanelServerSource, /command: \["Glob", "Grep", "Read", "LS", "Edit", "Write", "MultiEdit", "Bash", "BashOutput", "KillBash"\]/)
  assert.match(claudePanelServerSource, /function portableToolRuntime\(\)/)
  assert.match(claudePanelServerSource, /runtimeRoot, "uv-python"/)
  assert.match(claudePanelServerSource, /runtimeRoot, "openclaw", nodeName/)
  assert.match(claudePanelServerSource, /runtimeRoot, "video-tools", "ffmpeg", "bin"/)
  assert.match(claudePanelServerSource, /function prependPortableToolPath\(existingPath, dirs\)/)
  assert.match(claudePanelServerSource, /env\.SUPERCLAW_PORTABLE_PYTHON = tools\.python/)
  assert.match(claudeCommandsSource, /CLEAN_PANEL_HIGH_RISK_TOOLS_ENABLED", "1"/)
  assert.match(claudePanelServerSource, /set "PATH=\$\{path\.dirname\(claudeCommand\)\};\$\{env\.PATH \|\| "%PATH%"\}"/)
  assert.match(buildDesktopSource, /Packaged UV Python executable/)
  assert.match(buildDesktopSource, /Portable Python openpyxl module source/)
  assert.match(buildDesktopSource, /Packaged Python openpyxl module/)
  assert.match(buildDesktopSource, /Packaged FFmpeg executable/)
  assert.match(claudePanelSource, /lastToolProfile: overrides\.toolProfile \|\| permissionConfig\.toolProfile/)
})

test('ClaudeCode run status follows the active assistant reply and disappears after completion', () => {
  assert.doesNotMatch(claudePanelHtmlSource, /id="runStateChip"/)
  assert.match(claudePanelSource, /let runStateChip = null/)
  assert.match(claudePanelSource, /function ensureConversationRunState\(\)/)
  assert.match(claudePanelSource, /document\.createElement\("span"\)/)
  assert.match(claudePanelSource, /function mountRunStateBelowActiveAssistantMessage\(\)/)
  assert.match(claudePanelSource, /activeAssistantMessage\?\.row/)
  assert.match(claudePanelSource, /stateChip\.parentElement !== targetRow[\s\S]*?targetRow\.append\(stateChip\)/)
  assert.match(claudePanelSource, /function clearConversationRunState\(\)/)
  assert.match(claudePanelSource, /runStateChip\?\.remove\(\);[\s\S]*?runStateChip = null/)
  assert.match(claudePanelSource, /if \(state === "thinking"\)[\s\S]*?mountRunStateBelowActiveAssistantMessage\(\);[\s\S]*?else \{[\s\S]*?clearConversationRunState\(\)/)
  assert.match(claudePanelSource, /setRunState\("thinking", "执行中\.\.\."\)/)
  assert.match(claudePanelSource, /setRunState\("thinking", "回复中\.\.\."\)/)
  assert.match(claudePanelStylesSource, /\.message-row\.assistant\.has-turn-run-status[\s\S]*?flex-direction:\s*column\s*!important/)
  assert.match(claudePanelStylesSource, /\.turn-run-status-only[\s\S]*?justify-content:\s*flex-start\s*!important/)
  assert.match(claudePanelStylesSource, /\.turn-run-state\s*\{[\s\S]*?width:\s*max-content/)
  assert.match(claudePanelStylesSource, /\.turn-run-state\.thinking\s*\{[\s\S]*?border:\s*0\s*!important/)
  assert.match(claudePanelStylesSource, /@keyframes claude-turn-status-light/)
  assert.match(claudePanelStylesSource, /\.message-row\.user \.turn-run-state[\s\S]*?display:\s*none\s*!important/)
})

test('ClaudeCode classifies native CLI prose as execution detail before tool calls', () => {
  assert.match(claudePanelServerSource, /"--include-partial-messages"/)
  assert.match(claudePanelServerSource, /parsed\.type === "stream_event"/)
  assert.match(claudePanelServerSource, /streamEvent\.type === "content_block_delta"/)
  assert.match(claudePanelServerSource, /delta\.type === "text_delta"/)
  assert.match(claudePanelServerSource, /let bufferedAssistantDeltas = ""/)
  assert.match(claudePanelServerSource, /bufferedAssistantDeltas \+= safeDelta/)
  assert.match(claudePanelServerSource, /const turnText = text \|\| streamedText/)
  assert.match(claudePanelServerSource, /if \(toolBlocks\.length\) \{[\s\S]*?kind: "reasoning"[\s\S]*?text: sanitizeModelOutput\(turnText, \{ prompt \}\)/)
  assert.match(claudePanelServerSource, /if \(turnText\) \{[\s\S]*?writeEvent\(res, "text", \{ text: sanitizeModelOutput\(turnText, \{ prompt \}\) \}\)/)
  assert.match(claudePanelSource, /assistant-thinking-block__item-title/)
  assert.match(claudePanelSource, /assistant-thinking-block__item-detail/)
  assert.match(claudePanelSource, /function moveClaudeExecutionNarrativeToProcess\(\)/)
  assert.match(claudePanelSource, /function splitClaudeExecutionNarrative\(rawText\)/)
  assert.match(claudePanelSource, /输出文件\|处理结果\|执行结果\|验证结果\|最终结果/)
  assert.match(claudePanelSource, /moveClaudeExecutionNarrativeToProcess\(\);[\s\S]*?executionProcess: activeExecutionProcess/)
  assert.match(claudePanelSource, /role === "assistant" && executionProcess\.length[\s\S]*?splitClaudeExecutionNarrative\(message\.content\)/)
  assert.match(claudePanelStylesSource, /\.assistant-thinking-block__item \+ \.assistant-thinking-block__item/)
})

test('ClaudeCode compact layout cannot let the right panel consume the chat grid', () => {
  assert.match(claudePanelSource, /matchMedia\("\(max-width: 1180px\)"\)/)
  assert.match(claudePanelSource, /collapseRightPanelAtCompactBreakpoint\(compactRightPanelMedia\)/)
  assert.match(claudePanelStylesSource, /Final compact layout:[\s\S]*?@media \(max-width: 1180px\)/)
  assert.match(claudePanelStylesSource, /right-panel-collapsed \.run-panel\s*\{\s*display:\s*none\s*!important/)
  assert.match(claudePanelStylesSource, /body:not\(\.right-panel-collapsed\) \.run-panel[\s\S]*?position:\s*fixed\s*!important/)
  assert.match(claudePanelStylesSource, /@media \(max-width: 980px\)[\s\S]*?\.context-panel\s*\{\s*display:\s*none\s*!important/)
  assert.match(claudePanelStylesSource, /@media \(max-width: 980px\)[\s\S]*?\.workspace[\s\S]*?grid-column:\s*1\s*!important/)
  assert.match(claudePanelStylesSource, /@media \(max-width: 980px\)[\s\S]*?body\.conversation-mode\.right-panel-collapsed \.app-shell[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/)
  assert.match(claudePanelStylesSource, /body\.conversation-mode\.right-panel-collapsed \.app-shell\s*\{\s*grid-template-columns:\s*300px minmax\(0, 1fr\)\s*!important/)
  assert.match(claudePanelStylesSource, /@media \(max-width: 1180px\)[\s\S]*?body\.conversation-mode\.right-panel-collapsed \.app-shell[\s\S]*?grid-template-columns:\s*300px minmax\(0, 1fr\)\s*!important/)
})

test('ClaudeCode every mode grants read-only web research while Playwright stays mode-gated', () => {
  assert.match(claudePanelServerSource, /mcp__superclaw_web_research__web_search/)
  assert.match(claudePanelServerSource, /mcp__superclaw_web_research__web_fetch/)
  assert.match(claudePanelServerSource, /function ensurePortableWebResearchMcp/)
  assert.match(claudePanelServerSource, /function removeAccidentalHomeMcpEntries\(names\)/)
  assert.match(claudePanelServerSource, /superclaw_web_research:\s*\{/)
  assert.match(claudePanelServerSource, /const allowWebResearch = true/)
  assert.match(claudePanelServerSource, /\.\.\.WEB_RESEARCH_TOOLS,[\s\S]*?allowBrowserAutomation \? PLAYWRIGHT_AUTOMATION_TOOLS : \[\]/)
  assert.match(claudePanelServerSource, /if \(!options\.allowBrowserAutomation\) \{[\s\S]*?PLAYWRIGHT_AUTOMATION_TOOLS/)
  assert.match(claudePanelServerSource, /if \(!options\.allowWebResearch\) \{[\s\S]*?WEB_RESEARCH_TOOLS/)
  assert.match(claudePanelServerSource, /Use SuperClaw's local read-only web research MCP/)
  assert.match(claudePanelServerSource, /Do not use Claude cloud WebSearch or WebFetch/)
  assert.match(claudePanelServerSource, /authorizationGrant !== "web"/)
  assert.match(claudePanelServerSource, /主动使用 WebSearch 搜索公开网络/)
  assert.match(claudePanelServerSource, /WebFetch\/WebSearch 仅用于只读访问/)
  assert.match(claudePanelServerSource, /CURRENT_RUNTIME_CAPABILITY block is authoritative/)
  assert.match(claudePanelSource, /安全对话模式支持公开网络查询/)
  assert.match(claudePanelSource, /项目分析模式允许读取当前项目目录和查询公开网络/)
  assert.match(claudePanelSource, /查询公开信息，并在浏览器授权后使用 Playwright/)
  assert.match(claudePanelSource, /function isReadOnlyWebAuthorizationRequest\(text\)/)
  assert.match(claudePanelSource, /if \(isReadOnlyWebAuthorizationRequest\(value\)\) return "web"/)
  assert.match(claudePanelSource, /if \(type === "web"\) \{[\s\S]*?scheduleAuthorizationContinuation\(task, type, "once"\)/)
  assert.match(claudePanelSource, /所有对话模式都可以直接使用 WebSearch、WebFetch/)
  assert.match(claudePanelSource, /browserAccess:\s*window\.sessionStorage\.getItem\(browserAccessAlwaysKey\)/)
  assert.match(claudePanelHtmlSource, /20260716-claude-history1/)
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
