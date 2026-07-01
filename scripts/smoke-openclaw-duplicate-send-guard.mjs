import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(chat, /const\s+_activeOpenClawSendFingerprints\s*=\s*new Set\(\)/, 'Active OpenClaw request fingerprint set is missing')
assert.match(chat, /const\s+_requestFingerprintById\s*=\s*new Map\(\)/, 'Request fingerprint map is missing')
assert.match(chat, /function\s+getOpenClawRequestFingerprint\s*\(/, 'OpenClaw request fingerprint helper is missing')
assert.match(chat, /function\s+isOpenClawDuplicatePendingRequest\s*\(/, 'Duplicate pending request guard is missing')
assert.match(chat, /_activeOpenClawSendFingerprints\.has\(fingerprint\)/, 'Duplicate guard must check active request fingerprints')
assert.match(chat, /hasQueuedOpenClawRequestFingerprint\(fingerprint\)/, 'Duplicate guard must check queued request fingerprints')
assert.match(chat, /if\s*\(isOpenClawDuplicatePendingRequest\(requestFingerprint\)\)\s*\{[\s\S]*?已有相同请求正在处理/, 'sendMessage must block duplicate active requests before enqueue')
assert.match(chat, /_messageQueue\.push\(\{\s*text,\s*attachments,\s*clientRequestId,\s*requestFingerprint\s*\}\)/, 'Queued OpenClaw messages must carry request fingerprint')
assert.match(chat, /rememberOpenClawRequestFingerprint\(clientRequestId,\s*requestFingerprint\)/, 'doSend must mark active request fingerprint')
assert.match(chat, /releaseOpenClawRequestFingerprint\(clientRequestId\)/, 'Failed sends must release request fingerprint')
assert.match(chat, /ReplyRunAlreadyActiveError\|run already active\|already active/i, 'ReplyRunAlreadyActiveError must be handled')
assert.match(chat, /if\s*\(_openClawPendingResponse\s*\|\|\s*_isSending\s*\|\|\s*_isStreaming\)\s*\{[\s\S]*?_messageQueue\.push/, 'sendMessage must not start another OpenClaw request while a response is pending')
assert.match(chat, /if\s*\(_messageQueue\.length === 0\s*\|\|\s*_openClawPendingResponse\s*\|\|\s*_isSending\s*\|\|\s*_isStreaming\)\s*return/, 'processMessageQueue must wait until the pending OpenClaw response is closed')
assert.match(chat, /_sendBtn\.disabled\s*=\s*_sendInputLocked\s*\|\|\s*_openClawPendingResponse\s*\|\|\s*_isSending/, 'Send button must stay disabled while OpenClaw is waiting for a final response')

console.log('OPENCLAW_DUPLICATE_SEND_GUARD: PASS')
