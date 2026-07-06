import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  expectedFullContentMarker,
  fakeSensitiveOpenClawPayload,
  longOpenClawTaskResult,
  openClawResultForbiddenPaths,
  openClawResultRenderingNoParallelContract,
} from './fixtures/openclaw-result-rendering.fixture.js'

const CHAT_JS_PATH = new URL('../../src/engines/hermes/pages/chat.js', import.meta.url)
const TEST_SOURCE_PATH = new URL('./openclaw-result-rendering-regression.test.js', import.meta.url)
const PREVIEW_LIMIT = 220

const SENSITIVE_VALUES = Object.values(fakeSensitiveOpenClawPayload)

async function readChatSource() {
  return readFile(CHAT_JS_PATH, 'utf8')
}

async function readTestSource() {
  return readFile(TEST_SOURCE_PATH, 'utf8')
}

function assertNoSensitiveValues(value, label = 'value') {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sensitiveValue of SENSITIVE_VALUES) {
    assert.equal(serialized.includes(sensitiveValue), false, `${label} leaks ${sensitiveValue}`)
  }
}

test('OpenClaw result rendering fixture preserves long content and full content marker', () => {
  assert.ok(longOpenClawTaskResult.content.length > 1000, 'fixture content must be longer than 1000 chars')
  assert.ok(longOpenClawTaskResult.content.includes(expectedFullContentMarker), 'content must include full result marker')
  assert.equal(longOpenClawTaskResult.full_content, longOpenClawTaskResult.content)
  assert.ok(longOpenClawTaskResult.summary.length < longOpenClawTaskResult.content.length)
})

test('task_events.visible_text is summary only and cannot replace full OpenClaw result', () => {
  const event = longOpenClawTaskResult.task_events[0]
  assert.equal(typeof event.visible_text, 'string')
  assert.ok(event.visible_text.length < 500, 'visible_text should stay short enough for summary display')
  assert.equal(event.visible_text.includes(expectedFullContentMarker), false, 'visible_text must not be treated as full result')
  assert.notEqual(event.visible_text, longOpenClawTaskResult.content, 'visible_text cannot replace content')
})

test('OpenClaw result contract requires both summary and full content entry points', () => {
  assert.equal(typeof longOpenClawTaskResult.summary, 'string')
  assert.equal(typeof longOpenClawTaskResult.content, 'string')
  assert.equal(typeof longOpenClawTaskResult.full_content, 'string')
  assert.ok(longOpenClawTaskResult.full_content.includes(expectedFullContentMarker))
})

test('chat inbox must keep existing Hermes inbox and local task message rendering path', async () => {
  const source = await readChatSource()
  assert.match(source, /function\s+renderHermesInboxMessages\s*\(/)
  assert.match(source, /listAgentTaskMessages\s*\(\s*\{\s*toAgent:\s*COLLAB_TARGETS\.hermes\s*\}\s*\)/)
  assert.match(source, /superclaw-agent-task-message/)
  assert.match(source, /task_result/)
  assert.match(source, /item\.content/)
})

test('chat rendering should not rely only on 220 char preview for OpenClaw task_result', async () => {
  const source = await readChatSource()
  assert.match(source, /renderHermesInboxMessages/)
  assert.match(source, /renderCompactAssistantHtml/)
  assert.equal(
    /openclaw[\s\S]{0,240}(full_content|fullContent)|full_content[\s\S]{0,240}openclaw|fullContent[\s\S]{0,240}openclaw/i.test(source),
    true,
    'Expected rendering gap: OpenClaw result rendering needs an explicit full_content/fullContent entry point, not only compact preview',
  )
  assert.equal(longOpenClawTaskResult.content.slice(0, PREVIEW_LIMIT).includes(expectedFullContentMarker), false)
})

test('full OpenClaw result must not be stored only in progress bubble or task_events', async () => {
  const source = await readChatSource()
  assert.equal(
    /progress\s*bubble[\s\S]{0,240}full_content|task_events[\s\S]{0,240}OPENCLAW_FULL_RESULT_END/i.test(source),
    false,
    'full result must not live only in progress bubble/task_events',
  )
  assert.ok(longOpenClawTaskResult.content.includes(expectedFullContentMarker))
  assert.equal(JSON.stringify(longOpenClawTaskResult.task_events).includes(expectedFullContentMarker), false)
})

test('OpenClaw result rendering test does not create a second renderer or touch dev-api', async () => {
  const source = await readChatSource()
  const testSource = await readTestSource()
  const contract = openClawResultRenderingNoParallelContract.join('\n')
  const devApiPath = ['scripts', 'dev-api.js'].join('/')

  assert.match(source, /function\s+renderHermesInboxMessages\s*\(/)
  assert.equal(/function\s+renderOpenClawResultRenderer\s*\(/.test(source), false, 'must not create a second OpenClaw-specific renderer')
  assert.equal(testSource.includes(`from '../../${devApiPath}'`), false, 'test must not import scripts/dev-api.js')
  assert.equal(testSource.includes(`import '${devApiPath}'`), false, 'test must not import scripts/dev-api.js')
  assert.match(contract, /Do not create a second chat renderer/)
  assert.match(contract, /Do not rewrite scripts\/dev-api\.js/)
})

test('OpenClaw rendering fixtures do not expose fake sensitive values or forbidden paths', () => {
  const safeVisiblePayload = {
    summary: longOpenClawTaskResult.summary,
    task_events: longOpenClawTaskResult.task_events,
    tool_runs: longOpenClawTaskResult.tool_runs,
  }
  assertNoSensitiveValues(safeVisiblePayload, 'OpenClaw visible rendering fixture')

  const serialized = JSON.stringify(longOpenClawTaskResult)
  for (const forbiddenPath of openClawResultForbiddenPaths) {
    assert.equal(serialized.includes(forbiddenPath), false, `fixture references forbidden path ${forbiddenPath}`)
  }
})
