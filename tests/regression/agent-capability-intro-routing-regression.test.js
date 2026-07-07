import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

test('OpenClaw broad capability questions route before ecommerce-only answers', () => {
  const chat = read('src/pages/chat.js')
  assert.match(chat, /function isOpenClawBroadCapabilityQuestion/)
  assert.match(chat, /buildOpenClawCapabilitySummaryReply/)

  const handlerStart = chat.indexOf('function maybeHandleOpenClawLocalAnswer')
  assert.ok(handlerStart >= 0, 'missing maybeHandleOpenClawLocalAnswer')
  const handler = chat.slice(handlerStart, chat.indexOf('function clearOpenClawRuntimeForLocalAnswer'))
  assert.ok(handler.includes('isOpenClawBroadCapabilityQuestion(value)'), 'missing broad capability route')
  assert.ok(handler.includes('shouldAnswerOpenClawEcommerceCapability(value)'), 'missing ecommerce route')
  assert.ok(
    handler.indexOf('isOpenClawBroadCapabilityQuestion(value)') < handler.indexOf('shouldAnswerOpenClawEcommerceCapability(value)'),
    'broad capability route must run before ecommerce capability route',
  )
})

test('OpenClaw capability intro covers skills opr exec collaboration ecommerce safety and coding profile', () => {
  const chat = read('src/pages/chat.js')
  const start = chat.indexOf('function buildOpenClawCapabilitySummaryReply')
  const end = chat.indexOf('function maybeHandleOpenClawLocalAnswer')
  const block = chat.slice(start, end)
  for (const keyword of ['skills', 'opr', 'exec', 'collaboration', 'ecommerce', 'safety', 'tools.profile=coding']) {
    assert.match(block, new RegExp(keyword.replace('.', '\\.'), 'i'), `missing ${keyword}`)
  }
})

test('Hermes and Claude capability intros describe routing and permission boundaries', () => {
  const identity = read('src/shared/agent-identity-guard.js')
  assert.match(identity, /getAgentCapabilityIntro/)
  for (const keyword of ['Hermes', 'OpenClaw', 'Claude Code', 'collaboration', 'memory', 'observability']) {
    assert.match(identity, new RegExp(keyword.replace(' ', '\\s*'), 'i'), `missing Hermes keyword ${keyword}`)
  }
  for (const keyword of ['safe', 'browser_automation', 'takeover', 'permission_level', 'requires_confirmation', 'Hermes']) {
    assert.match(identity, new RegExp(keyword, 'i'), `missing Claude keyword ${keyword}`)
  }
})

test('capability registry no longer describes current OpenClaw effective profile as minimal', () => {
  const registry = read('docs/registry/AGENT_CAPABILITY_REGISTRY.md')
  assert.doesNotMatch(registry, /current\s+`minimal`\s+profile\s+is\s+too\s+narrow/i)
  assert.match(registry, /tools\.profile=coding/)
})

test('release gate includes agent capability intro routing regression', () => {
  const gates = read('scripts/check-release-gates.mjs')
  assert.match(gates, /tests\/regression\/agent-capability-intro-routing-regression\.test\.js/)
})
