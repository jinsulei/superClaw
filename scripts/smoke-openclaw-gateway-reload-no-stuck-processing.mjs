import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(chat, /function\s+recoverOpenClawGenerationAfterTransientDisconnect\s*\(/, 'OpenClaw transient recovery helper is missing')
assert.match(chat, /function\s+isOpenClawGatewayAbortErrorText\s*\(/, 'OpenClaw abort error classifier is missing')
assert.match(chat, /signal is aborted\|aborted without reason/, 'Abort classifier must recognize signal-aborted errors')
assert.match(chat, /clearOpenClawGenerationState\(reason,\s*requestId\)/, 'Transient recovery must clear generation state')
assert.match(chat, /resetStreamState\(\)/, 'Transient recovery must reset stream state')
assert.match(chat, /await\s+loadHistory\(\)/, 'Transient recovery must merge latest history')
assert.match(chat, /function\s+scheduleOpenClawTransientRecovery\s*\(/, 'OpenClaw delayed transient recovery scheduler is missing')
assert.match(chat, /function\s+recoverOpenClawAssistantFromHistoryBeforeFallback\s*\(/, 'OpenClaw must recover assistant history before rendering fallback')
assert.match(chat, /scheduleOpenClawTransientRecovery\(`ws-\$\{status\}`,\s*\{\s*notify:\s*false\s*\}\)/, 'WS reconnect/disconnect must schedule delayed recovery')
assert.doesNotMatch(chat, /recoverOpenClawGenerationAfterTransientDisconnect\(`ws-\$\{status\}`,\s*\{\s*notify:\s*false\s*\}\)/, 'WS reconnect/disconnect must not clear active generation immediately')
assert.match(chat, /clearOpenClawTransientRecoveryTimer\(\)/, 'Normal delta/final handling must cancel delayed recovery')
assert.match(chat, /const transientText = `\$\{probe\?\.error \|\| ''\} \$\{probe\?\.message \|\| ''\}`/, 'Transient Gateway reconciliation must inspect dev status error text')
assert.match(chat, /const health = await probeOpenClawGatewayHealthForSend\(\)\.catch\(\(\) => null\)/, 'Transient Gateway reconciliation must double-check /health before showing error')
assert.match(chat, /markOpenClawGatewayReady\(`\$\{reason\}-health-ready`, \{ probe: health \}\)/, 'Transient Gateway reconciliation must converge UI to ready when /health is live')
assert.match(chat, /const recoverableAbortError = requestedState === 'error'[\s\S]*?isOpenClawGatewayAbortErrorText\(detailText\)[\s\S]*?\(wsClient\.connected \|\| wsClient\.gatewayReady\)/, 'Signal-aborted Gateway UI errors must not keep the ready UI stuck offline')
assert.match(chat, /recoverOpenClawAssistantFromHistoryBeforeFallback\('history-visible-assistant-after-empty-final'/, 'Empty final must recover from Gateway history before giving up')
assert.match(chat, /recoverOpenClawAssistantFromHistoryBeforeFallback\('aborted-before-fallback'/, 'Aborted stream must recover from Gateway history before fallback')
assert.match(chat, /showTyping\(true,\s*t\('chat\.aiThinking'\)\)\s*\n\s*_startResponseWatchdog\(\)/, 'History refresh that only captured the user message must keep waiting for assistant history')
assert.match(chat, /isOpenClawGatewayAbortErrorText\(errMsg\)/, 'Chat error events must use abort recovery path')
assert.match(chat, /OpenClaw 连接中断，已恢复发送状态/, 'User-visible recovery message is missing')

console.log('OPENCLAW_GATEWAY_RELOAD_NO_STUCK_PROCESSING: PASS')
