import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  classifyHermesStreamingText,
  extractHermesStreamingExecutionNarration,
  sanitizeFrontendObservabilityText,
  splitHermesExecutionProtocol,
  stripHermesExecutionNarrationBlocks,
} from '../../src/engines/hermes/lib/chat-store.js'

const root = resolve('.')
const read = (relative) => readFileSync(resolve(root, relative), 'utf8')

test('Hermes routes long visible work narration into its execution trace', () => {
  const store = read('src/engines/hermes/lib/chat-store.js')
  const chat = read('src/engines/hermes/pages/chat.js')
  const css = read('src/engines/hermes/style/hermes.css')

  assert.match(store, /splitHermesLongExecutionNarration/)
  assert.match(store, /partitioned\.execution/)
  assert.match(store, /partitioned\.execution\.length\s*\?\s*finalReply/)
  assert.match(store, /Portable document execution rule/)
  assert.match(store, /Required UI boundary/)
  assert.match(store, /Never end an actionable task without this boundary/)
  assert.match(store, /do not run python, python3, py, uv, venv, pip, npm, npx/i)
  assert.match(store, /Do not replace the requested PPT\/PPTX deliverable with an HTML deck/)
  assert.match(chat, /hm-chat-execution-detail-toggle/)
  assert.match(chat, /detailLabel/)
  assert.match(chat, /execute_code.*查看命令/)
  assert.match(store, /genericToolEventId/)
  assert.match(store, /matchingToolSteps/)
  assert.match(css, /hm-chat-execution-detail-toggle/)
})

test('Hermes streams visible plans into the execution trace from the first chunk', () => {
  const narration = extractHermesStreamingExecutionNarration('好的，我先确认 PPT 规范和现有模板，再调用内置服务生成文件。')
  assert.match(narration, /确认 PPT 规范/)
})

test('Hermes recognises a visible work plan assembled from fragmented stream deltas', () => {
  const opening = classifyHermesStreamingText('好的，')
  assert.equal(opening.kind, 'pending')

  const assembled = classifyHermesStreamingText('好的，我先确认 PPT 规范和现有模板，再调用内置服务生成可编辑文件。接下来验证输出并整理预览。')
  assert.equal(assembled.kind, 'execution')
})

test('Hermes removes multi-paragraph work narration from the final reply', () => {
  const reply = stripHermesExecutionNarrationBlocks([
    '好的，我先检查现有模板，然后调用内置服务生成 PPT。',
    '脚本已写好，现在执行生成并验证文件。',
    '已生成可编辑 PPTX，文件已附在本轮回复中。',
  ].join('\n\n'))
  assert.equal(reply, '已生成可编辑 PPTX，文件已附在本轮回复中。')
})

test('Hermes reserves the FINAL protocol section for the rendered conclusion', () => {
  const result = splitHermesExecutionProtocol([
    '先检查现有模板和可用工具。',
    '正在生成并验证文件。',
    'FINAL:',
    '## 验证结果',
    '- 已生成 PPTX',
    '- 已完成文件验证',
  ].join('\n'))

  assert.equal(result.execution, '先检查现有模板和可用工具。\n正在生成并验证文件。')
  assert.equal(result.final, '## 验证结果\n- 已生成 PPTX\n- 已完成文件验证')
  assert.equal(result.hasFinal, true)
})

test('Hermes treats an unmarked streamed reply as execution until completion', () => {
  const result = splitHermesExecutionProtocol('正在检查依赖，然后执行生成命令。')
  assert.equal(result.execution, '正在检查依赖，然后执行生成命令。')
  assert.equal(result.final, '')
  assert.equal(result.hasFinal, false)
})

test('Hermes native Tauri deltas use the same execution-first stream handler', () => {
  const store = read('src/engines/hermes/lib/chat-store.js')
  const nativeDeltaListener = store.match(/tauriListen\('hermes-run-delta',[\s\S]*?tauriListen\('hermes-run-tool'/)?.[0] || ''
  assert.match(nativeDeltaListener, /appendStreamDelta\(trackedSessionId, delta, clientRequestId\)/)
  assert.doesNotMatch(nativeDeltaListener, /msg\.content\s*=\s*sanitizeHermesVisibleReply/)
})

test('Hermes does not let a late unmarked final event erase a completed reply', () => {
  const store = read('src/engines/hermes/lib/chat-store.js')
  const replaceOutput = store.match(/function replaceStreamOutput\([\s\S]*?function failStreamRun/)?.[0] || ''
  assert.match(replaceOutput, /if \(!protocol\.hasFinal && !msg\.isStreaming\)/)
  assert.match(replaceOutput, /late event must not clear that summary/)
})

test('Hermes appends a new narration segment after each tool boundary', () => {
  const store = read('src/engines/hermes/lib/chat-store.js')
  assert.match(store, /function beginNextHermesStreamNarration/)
  assert.match(store, /executionOffset = protocol\.execution\.length/)
  assert.match(store, /beginNextHermesStreamNarration\(clientRequestId\)/)
  assert.match(store, /beginNextHermesStreamNarration\(state\.runningClientRequestId\)/)
  assert.match(store, /reasoning:stream:\$\{streamState\.narrationStep\}/)
})

test('Hermes execution card exposes commands but not raw tool output', () => {
  const store = read('src/engines/hermes/lib/chat-store.js')
  const chat = read('src/engines/hermes/pages/chat.js')
  assert.match(store, /eventType === 'tool\.completed'/)
  assert.match(store, /step\.output = ''/)
  assert.doesNotMatch(chat, /output \? `结果\\n\$\{output\}`/)
})

test('Windows Python diagnostic does not prefer python3 over the bundled runtime', () => {
  const rust = read('src-tauri/src/commands/hermes.rs')
  const windowsCandidates = rust.match(/#\[cfg\(target_os = "windows"\)\][\s\S]{0,500}?vec!\[([\s\S]{0,300}?)\]/)
  assert.ok(windowsCandidates)
  assert.doesNotMatch(windowsCandidates[1], /"python3"/)
})

test('Hermes execution view keeps generated document paths but still hides secret paths', () => {
  const documentPath = 'C:\\Users\\ZXKJ\\Documents\\superClaw_code\\SuperClaw_Desktop_Client_FileService_Verified\\reports\\SuperClaw_Feature_Overview.pptx'
  const visible = sanitizeFrontendObservabilityText(`Created: ${documentPath}`)
  const secret = sanitizeFrontendObservabilityText('Read C:\\Users\\ZXKJ\\Documents\\superClaw_code\\src-tauri\\resources\\data\\secrets\\.env')

  assert.match(visible, new RegExp(documentPath.replace(/[\\.^$*+?()[\]{}|]/g, '\\$&')))
  assert.doesNotMatch(visible, /REDACTED_PATH/)
  assert.match(secret, /REDACTED_PATH/)
})
