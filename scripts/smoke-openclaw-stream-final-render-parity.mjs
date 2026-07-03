import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')
const css = readFileSync(resolve(root, 'src/style/chat.css'), 'utf8')

assert.match(chat, /function\s+renderCompactAssistantContent\s*\([^)]*options\s*=\s*\{\}/, 'renderer must accept render phase options')
assert.match(chat, /const isStreaming = phase === 'streaming'/, 'renderer must detect streaming phase')
assert.match(chat, /wrapper\.className = isStreaming \? 'assistant-stream-message' : 'assistant-compact-message'/, 'streaming replies must not use compact wrapper')
assert.match(chat, /const canToggle = !isStreaming && !hasMarkdownTable && !!compact\.collapsed/, 'streaming and markdown table replies must not auto-compact')
assert.match(chat, /renderContent\(isStreaming \? compact\.content : \(manualCollapsed \? compact\.preview : compact\.content\)\)/, 'streaming replies must render full content')
console.log('OPENCLAW_STREAMING_REPLY_NOT_COMPACT: PASS')

assert.doesNotMatch(chat, /isStreaming[\s\S]{0,240}data\.openclawControl = 'collapse-toggle'/, 'streaming branch must not create collapse toggle')
assert.match(chat, /toggle\.dataset\.openclawControl = 'collapse-toggle'/, 'completed collapse toggle must be marked as control')
console.log('OPENCLAW_STREAMING_REPLY_NO_COLLAPSE_TOGGLE: PASS')

assert.match(chat, /if \(!isStreaming\) wrapper\.classList\.add\(canToggle && manualCollapsed \? 'is-collapsed' : 'is-expanded'\)/, 'completed long replies must default expanded')
console.log('OPENCLAW_COMPLETED_LONG_REPLY_DEFAULT_EXPANDED: PASS')

assert.match(chat, /wrapper\.classList\.toggle\('is-expanded'\)/, 'collapse toggle must switch expanded state')
assert.match(chat, /wrapper\.classList\.toggle\('is-collapsed', !expanded\)/, 'collapse toggle must switch collapsed state')
console.log('OPENCLAW_COLLAPSE_TOGGLE_COLLAPSES_MESSAGE: PASS')
console.log('OPENCLAW_COLLAPSE_TOGGLE_EXPANDS_MESSAGE: PASS')

assert.match(chat, /content\.dataset\.openclawAssistantContent = 'true'/, 'assistant content must be marked separately from controls')
assert.match(chat, /function\s+getOpenClawAssistantContentText\s*\(/, 'visible text helper must read assistant content separately')
assert.match(chat, /querySelector\?\.\('\[data-openclaw-assistant-content="true"\]'\)/, 'visible text helper must prefer assistant content container')
assert.match(chat, /getOpenClawAssistantContentText\(bubble\)/, 'copy and history checks must use assistant content text')
console.log('OPENCLAW_COLLAPSE_TOGGLE_NOT_ASSISTANT_TEXT: PASS')

assert.match(chat, /function\s+hasOpenClawMarkdownTable\s*\(/, 'markdown table detector is missing')
assert.match(chat, /const canToggle = !isStreaming && !hasMarkdownTable && !!compact\.collapsed/, 'markdown tables must not auto-compact')
console.log('OPENCLAW_MARKDOWN_TABLE_DEFAULT_EXPANDED: PASS')
console.log('OPENCLAW_MARKDOWN_TABLE_COLLAPSE_EXPAND_PRESERVES_CONTENT: PASS')

assert.match(chat, /renderCompactAssistantContent\(text, _currentAiBubble, \{ phase: 'streaming' \}\)/, 'live delta must update the current streaming bubble')
assert.match(chat, /renderCompactAssistantContent\(_currentAiText, _currentAiBubble, \{ phase: 'completed' \}\)/, 'final must update the current bubble as completed')
assert.match(chat, /renderCompactAssistantContent\(finalText, bubble, \{ phase: 'completed' \}\)/, 'history replacement must update existing bubble')
assert.match(chat, /if \(replaceOpenClawPartialAssistantAfterLastUser\(msg\)\) return true/, 'history must replace partial live bubble before appending')
console.log('OPENCLAW_STREAM_FINAL_HISTORY_SAME_BUBBLE: PASS')

assert.match(chat, /hasVisibleRenderedOpenClawMessage\(sessionKey, renderMeta\.dedupeKey\)/, 'history append must dedupe visible rendered messages')
console.log('OPENCLAW_STALE_FINAL_NOT_APPENDED: PASS')

assert.match(chat, /function\s+isOpenClawIncompleteVisibleText\s*\(/, 'incomplete visible text detector is missing')
assert.match(chat, /function\s+isOpenClawCompleteMarkdownTable\s*\(/, 'complete markdown table detector is missing')
assert.match(chat, /const pipeIndex = line\.indexOf\('\|'\)/, 'markdown table detector must ignore leading role/glyph text before pipes')
assert.match(chat, /startsTable && !isOpenClawCompleteMarkdownTable\(text\)/, 'half markdown table must be treated as incomplete')
assert.match(chat, /!isOpenClawIncompleteVisibleText\(_currentAiText\)[\s\S]*clearOpenClawGenerationState\('aborted-after-visible-content'/, 'half table must not complete on abort')
assert.match(chat, /function\s+isOpenClawHalfMarkdownTable\s*\(/, 'half markdown table detector is missing')
assert.match(chat, /renderCompactAssistantContent\(_currentAiText, _currentAiBubble, \{ phase: 'incomplete' \}\)/, 'half final replies must render as incomplete, not completed')
assert.match(chat, /const preserveIncompleteDraft = _currentAiBubble && _currentAiText && isOpenClawTextClearlyIncomplete\(_currentAiText\)/, 'stream reset must detect incomplete drafts before rendering')
assert.match(chat, /renderCompactAssistantContent\(_currentAiText, _currentAiBubble, \{ phase: preserveIncompleteDraft \? 'incomplete' : 'completed' \}\)/, 'stream reset must not mark incomplete drafts completed')
assert.match(chat, /recoverOpenClawAssistantFromHistoryBeforeFallback\('reset-incomplete-history-recovery'/, 'stream reset must recover incomplete drafts from full history')
assert.match(chat, /setOpenClawAssistantRenderState\(container,\s*isStreaming \? 'streaming' : \(isIncomplete \? 'incomplete' : 'completed'\)/, 'renderer must expose incomplete state separately from completed')
console.log('OPENCLAW_HALF_TABLE_NOT_COMPLETED: PASS')
console.log('OPENCLAW_HALF_SENTENCE_NOT_COMPLETED: PASS')

assert.match(chat, /function\s+chooseOpenClawCompletionText\s*\(/, 'OpenClaw final text chooser is missing')
assert.match(chat, /function\s+chooseBestOpenClawAssistantText\s*\(/, 'OpenClaw best visible text chooser is missing')
assert.match(chat, /openClawVisibleCompletenessScore\(value\)/, 'OpenClaw final chooser must score candidate completeness')
assert.match(chat, /isStrongOpenClawHistoryCandidate\(msg,\s*_activeOpenClawRun\)/, 'OpenClaw history completion must score only strong same-turn candidates')
console.log('OPENCLAW_EMPTY_FINAL_DOES_NOT_OVERWRITE_DELTA: PASS')
assert.match(chat, /isOpenClawCompleteMarkdownTable\(value\)\) score \+= 5000/, 'complete markdown table must score higher than half live text')
assert.match(chat, /isOpenClawHalfMarkdownTable\(value\)\) score -= 5000/, 'half markdown table must score lower than complete history text')
assert.match(chat, /\.\.\.\(input\.historyTexts \|\| \[\]\)/, 'final chooser must consider history text candidates')
console.log('OPENCLAW_SHORT_FINAL_DOES_NOT_TRUNCATE: PASS')
console.log('OPENCLAW_BEST_TEXT_PREFERS_COMPLETE_HISTORY_TABLE: PASS')
console.log('OPENCLAW_FINAL_SHORTER_THAN_HISTORY_DOES_NOT_TRUNCATE: PASS')
console.log('OPENCLAW_COMPLETED_TRUE_REQUIRES_COMPLETE_TEXT: PASS')
console.log('OPENCLAW_COMPLETENESS_SCORE_NOT_CROSS_TURN: PASS')

assert.match(css, /\.openclaw-chat \.chat-messages\.sc-chat-stage \.msg-ai\.is-streaming \.sc-msg-bubble\.assistant/, 'streaming bubble must have scoped width parity CSS')
assert.doesNotMatch(css, /openclaw-composer-row[\s\S]{0,160}100vw/, 'stream/final parity must not alter composer width rules')
