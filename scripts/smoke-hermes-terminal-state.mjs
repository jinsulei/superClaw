import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  completeHermesReplyIfNeeded,
  looksHermesReplyIncomplete,
  mapHermesErrorToUserMessage,
} from '../src/engines/hermes/lib/hermes-response-assembler.js'

assert.match(mapHermesErrorToUserMessage('invalid params, invalid image detail: auto (2013)'), /图片参数不兼容/)
assert.match(mapHermesErrorToUserMessage('401 unauthorized'), /权限不可用|模型或接口/)
assert.match(mapHermesErrorToUserMessage('request timed out'), /任务超时/)
assert.match(mapHermesErrorToUserMessage('unsupported image-to-image'), /暂不支持|不支持/)
assert.match(mapHermesErrorToUserMessage({ message: 'boom' }), /任务失败/)

assert.equal(looksHermesReplyIncomplete('结果：'), true)
assert.equal(looksHermesReplyIncomplete('已经完成。'), false)
assert.match(completeHermesReplyIfNeeded('结果：', { userText: '汇报检查结果', toolResult: true }), /以上是当前结果/)

const store = fs.readFileSync('src/engines/hermes/lib/chat-store.js', 'utf8')

assert.match(store, /function finalizeHermesRequestState/)
assert.match(store, /cleanupAfterRun\(\{\s*status:\s*'success'/)
assert.match(store, /cleanupAfterRun\(\{\s*status:\s*'failed'/)
assert.match(store, /cleanupAfterRun\(\{\s*status:\s*'cancelled'/)
assert.match(store, /mapHermesErrorToUserMessage/)
assert.match(store, /buildHermesTaskStatusReply/)
assert.match(store, /isHermesTaskStatusQuestion/)
assert.doesNotMatch(store.match(/function stopStreaming\(\)[\s\S]*?function updateSessionTitleFromFirstUser/)?.[0] || '', /\(stopped\)|_\(\s*stopped\s*\)_/)
assert.match(store, /imageIntentReply[\s\S]*visibleUserPromptByRequestId\.delete\(clientRequestId\)/)

console.log('PASS smoke-hermes-terminal-state')
