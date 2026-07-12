import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const workspacePolicy = read('src-tauri/resources/templates/openclaw-workspace/AGENTS.md')
const taskSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-task-policy/SKILL.md')
const chat = read('src/pages/chat.js')

test('OpenClaw workspace policy makes native tools the execution authority', () => {
  assert.match(workspacePolicy, /native execution agent/i)
  assert.match(workspacePolicy, /Do not stop after/i)
  assert.match(workspacePolicy, /confirmation-required/i)
  assert.match(workspacePolicy, /Ecommerce/i)
  assert.match(workspacePolicy, /OCR/i)
  assert.match(workspacePolicy, /Finance/i)
})

test('SuperClaw task policy keeps ecommerce, OCR, and finance inside native skills', () => {
  assert.match(taskSkill, /^name: superclaw-task-policy/m)
  assert.match(taskSkill, /supplements native\s+OpenClaw tools/i)
  assert.match(taskSkill, /Ecommerce/)
  assert.match(taskSkill, /OCR and Documents/)
  assert.match(taskSkill, /Finance/)
  assert.match(taskSkill, /confirmation/i)
})

test('OpenClaw UI remains a Gateway sender instead of a local answer generator', () => {
  const sendStart = chat.indexOf('async function sendMessage(')
  const sendEnd = chat.indexOf('async function doSend(', sendStart)
  const send = chat.slice(sendStart, sendEnd)

  assert.doesNotMatch(send, /maybeHandleOpenClawLocalAnswer\(/)
  assert.doesNotMatch(send, /appendOpenClawLocalEcommerceAnswer\(/)
  assert.doesNotMatch(send, /appendOpenClawLocalIdentityAnswer\(/)
  assert.match(chat, /wsClient\.chatSend\(_sessionKey, sendText/)
})
