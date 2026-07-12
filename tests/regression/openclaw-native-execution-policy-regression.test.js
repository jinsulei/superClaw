import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const workspacePolicy = read('src-tauri/resources/templates/openclaw-workspace/AGENTS.md')
const taskSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-task-policy/SKILL.md')
const ecommerceSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-ecommerce/SKILL.md')
const financeSkill = read('src-tauri/resources/templates/openclaw-workspace/skills/superclaw-finance/SKILL.md')
const chat = read('src/pages/chat.js')
const ocrPlugin = read('src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-ocr/index.js')
const ocrManifest = read('src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-ocr/openclaw.plugin.json')

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

test('OpenClaw attachment OCR is delegated to the Gateway rather than precomputed in chat send', () => {
  const sendStart = chat.indexOf('async function sendMessage(')
  const sendEnd = chat.indexOf('async function doSend(', sendStart)
  const send = chat.slice(sendStart, sendEnd)

  assert.doesNotMatch(send, /runOcrForAttachmentData\(/)
  assert.doesNotMatch(send, /\[OCR\]/)
  assert.match(chat, /Call superclaw_ocr with imagePath=/)
  assert.match(chat, /IMAGE_ATTACHMENT_CONTEXT/)
})

test('OpenClaw OCR uses the shared portable runtime through a native plugin', () => {
  assert.match(ocrManifest, /"id": "superclaw-ocr"/)
  assert.match(ocrManifest, /"superclaw_ocr"/)
  assert.match(ocrPlugin, /definePluginEntry/)
  assert.match(ocrPlugin, /name: "superclaw_ocr"/)
  assert.match(ocrPlugin, /ocr-runner\.cjs/)
  assert.match(ocrPlugin, /runtimeRoot\(\)/)
  assert.match(ocrPlugin, /TESSDATA_PREFIX/)
  assert.match(ocrPlugin, /Do not call it automatically for every attachment/)
  assert.doesNotMatch(ocrPlugin, /C:\\\\Users|C:\\/)
})

test('product workflows stay in native skills with explicit confirmation boundaries', () => {
  assert.match(ecommerceSkill, /^name: superclaw-ecommerce/m)
  assert.match(ecommerceSkill, /desktop_control/)
  assert.match(ecommerceSkill, /current browser context/i)
  assert.match(ecommerceSkill, /explicit confirmation/i)
  assert.match(financeSkill, /^name: superclaw-finance/m)
  assert.match(financeSkill, /superclaw_ocr/)
  assert.match(financeSkill, /Never transfer funds/i)
})
