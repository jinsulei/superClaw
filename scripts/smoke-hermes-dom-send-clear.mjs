import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const chat = fs.readFileSync(path.join(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

function blockBetween(startNeedle, endNeedle) {
  const start = chat.indexOf(startNeedle)
  const end = chat.indexOf(endNeedle, start)
  assert.ok(start >= 0 && end > start, `block exists: ${startNeedle}`)
  return chat.slice(start, end)
}

const drawBlock = blockBetween('function draw()', 'function isMessagesNearBottom')
assert.match(drawBlock, /suppressTextareaCaptureUntil/)
assert.match(drawBlock, /activeInput && !suppressTextareaCapture/)
assert.match(drawBlock, /activeInput\.value = inputValue/)
console.log('HERMES_DRAW_DOES_NOT_REFILL_DRAFT: PASS')

const handleSendBlock = blockBetween('async function handleSend(', '// ----------------------------------------------------------- search modal')
assert.match(handleSendBlock, /hermesSendInFlight/)
assert.match(handleSendBlock, /if \(\(!text && !attachments\.length\) \|\| store\.state\.streaming \|\| hermesSendInFlight\) return/)
assert.match(handleSendBlock, /const clientRequestId = createClientRequestId\(\)/)
assert.match(handleSendBlock, /const restoreText = inputValue/)
assert.match(handleSendBlock, /resetInput\(\)/)
assert.match(handleSendBlock, /clearLiveTextareaDomValue\(\)/)
assert.ok(handleSendBlock.indexOf('clearLiveTextareaDomValue()') < handleSendBlock.indexOf('await store.sendMessage'), 'textarea clears before awaiting send')
assert.ok(handleSendBlock.indexOf('hermesSendInFlight = true') < handleSendBlock.indexOf('await maybeRunEcommerceStage'), 'send lock is set before the first async branch')
assert.ok(handleSendBlock.indexOf('clearDraftForSend()') < handleSendBlock.indexOf('runHermesAttachmentOcr'), 'draft clears before slow OCR work')
assert.match(handleSendBlock, /clientRequestId,/)
console.log('HERMES_DOM_DRAFT_CLEARS_IMMEDIATELY: PASS')

assert.match(handleSendBlock, /inputValue = restoreText/)
assert.match(handleSendBlock, /restoreLiveTextareaDomValue\(restoreText, restoreCaret\)/)
assert.match(handleSendBlock, /pendingAttachments = restoreAttachments/)
console.log('HERMES_SEND_FAILURE_RESTORES_DRAFT: PASS')

assert.match(chat, /function clearLiveTextareaDomValue\(\)/)
assert.match(chat, /function restoreLiveTextareaDomValue/)
console.log('smoke-hermes-dom-send-clear: PASS')
