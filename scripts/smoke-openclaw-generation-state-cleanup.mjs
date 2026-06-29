import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const source = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`)
    process.exitCode = 1
  } else {
    console.log(`[PASS] ${message}`)
  }
}

function blockOf(name) {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) return ''
  const open = source.indexOf('{', start)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return ''
}

const cleanupBlock = blockOf('clearOpenClawGenerationState')
const warningBlock = blockOf('maybeShowOpenClawLongResponseWarning')
const stopBlock = blockOf('stopGeneration')
const watchdogBlock = blockOf('_startResponseWatchdog')
const sendBlock = blockOf('doSend')

assert(cleanupBlock, 'OpenClaw has a unified generation cleanup function')
assert(/_openClawPendingResponse\s*=\s*false/.test(cleanupBlock), 'cleanup clears pending response state')
assert(/_openClawActiveRequestClosed\s*=\s*true/.test(cleanupBlock), 'cleanup marks active request closed')
assert(/_isSending\s*=\s*false/.test(cleanupBlock), 'cleanup clears sending state')
assert(/_isStreaming\s*=\s*false/.test(cleanupBlock), 'cleanup clears streaming state')
assert(/_cancelResponseWatchdog\(\)/.test(cleanupBlock), 'cleanup clears response watchdog')
assert(/clearGenerationTimeoutManager\(\)/.test(cleanupBlock), 'cleanup clears generation timeout manager')
assert(/clearOpenClawGenerationNotice\(\)/.test(cleanupBlock), 'cleanup hides long response warning')
assert(/hideOpenClawGenerationActions\(\)/.test(cleanupBlock), 'cleanup hides wait stop continue controls')

assert(/_openClawPendingResponse\s*=\s*true/.test(sendBlock), 'send marks request pending')
assert(/_openClawActiveRequestClosed\s*=\s*false/.test(sendBlock), 'send opens active request')

assert(warningBlock, 'OpenClaw has guarded long response warning function')
assert(/function maybeShowOpenClawLongResponseWarning[\s\S]*?requestId[\s\S]*?_activeClientRequestId/.test(source), 'long response warning checks active request id')
assert(/function maybeShowOpenClawLongResponseWarning[\s\S]*?_openClawActiveRequestClosed/.test(source), 'long response warning checks terminal request state')
assert(/function maybeShowOpenClawLongResponseWarning[\s\S]*?_openClawPendingResponse/.test(source), 'long response warning checks pending response state')
assert(/function maybeShowOpenClawLongResponseWarning[\s\S]*?hasOpenClawAssistantVisibleContentForRequest/.test(source), 'long response warning checks visible assistant content')
assert(!/_openClawGatewayUiState|progress|portListening|verified/.test(warningBlock), 'message warning is not driven by Gateway checking/progress state')

assert(/maybeShowOpenClawLongResponseWarning\(message,\s*requestId/.test(source), 'generation timeout manager uses guarded warning')
assert(/maybeShowOpenClawLongResponseWarning\([^)]*\{\s*actions:\s*true\s*\}/.test(source), 'idle timeout actions use guarded warning')
assert(/clearOpenClawGenerationState\([^)]*'tool-result-completed'/.test(source), 'tool result completion clears generation state')
assert(/clearOpenClawGenerationState\('duplicate-final'/.test(source), 'duplicate terminal final clears generation state')
assert(/clearOpenClawGenerationState\('empty-final'/.test(source), 'empty terminal final clears generation state')
assert(/clearOpenClawGenerationState\('history-visible-assistant'/.test(watchdogBlock), 'history-visible assistant clears stale generation state')
assert(/clearOpenClawGenerationState\('watchdog-visible-assistant'/.test(watchdogBlock), 'watchdog-visible assistant clears stale generation state')

assert(stopBlock && /clearOpenClawGenerationState\('stopped'/.test(stopBlock), 'stop generation closes active request state')
assert(stopBlock && !/showOpenClawGenerationNotice/.test(stopBlock), 'stop generation does not keep long response notice visible')
assert(!/_\(stopped\)_|\(stopped\)/.test(source), 'OpenClaw does not append raw stopped marker')
assert(!/continue.*_activeClientRequestId|_activeClientRequestId.*continue/.test(source), 'continue generation does not reuse closed request id directly')

if (process.exitCode) {
  console.error('\nopenclaw generation state cleanup smoke failed')
  process.exit(process.exitCode)
}

console.log('\nopenclaw generation state cleanup smoke passed')
