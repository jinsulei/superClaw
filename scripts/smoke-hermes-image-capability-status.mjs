import assert from 'node:assert/strict'

import {
  buildHermesImageCapabilityStatus,
  formatHermesImageCapabilityReply,
  formatHermesImageCapabilityReadFailureReply,
  isHermesImageCapabilityQuestion,
} from '../src/engines/hermes/lib/hermes-image-capability.js'

assert.equal(isHermesImageCapabilityQuestion('你现在能不能文生图？'), true)
assert.equal(isHermesImageCapabilityQuestion('支持图生图和识图吗'), true)
assert.equal(isHermesImageCapabilityQuestion('今天天气怎么样'), false)

const skillOnly = buildHermesImageCapabilityStatus({
  effectiveModelConfig: {},
  hermesConfig: {},
  providers: [],
  skills: [{ category: 'minimax-image-generation', skills: [{ slug: 'minimax-image-generation' }] }],
  env: {},
})
assert.equal(skillOnly.skillInstalled, true)
assert.equal(skillOnly.modelConfigured, false)
assert.equal(skillOnly.apiKeyConfigured, false)
assert.equal(skillOnly.endpointCallable, false)
assert.equal(skillOnly.capabilityReady, false)
const skillOnlyReply = formatHermesImageCapabilityReply(skillOnly)
assert.match(skillOnlyReply, /skillInstalled：是/)
assert.match(skillOnlyReply, /modelConfigured：否/)
assert.match(skillOnlyReply, /apiKeyConfigured：否/)
assert.match(skillOnlyReply, /endpointCallable：否/)
assert.match(skillOnlyReply, /capabilityReady：否/)
assert.match(skillOnlyReply, /已安装图像生成 skill，但当前没有检测到可调用的图片模型\/API Key/)

const nameOnlyGptImage = buildHermesImageCapabilityStatus({
  effectiveModelConfig: {
    status: 'ready',
    provider: 'openai',
    model: 'gpt-image-2',
    apiKeyConfigured: true,
  },
  hermesConfig: {},
  providers: [{ id: 'openai', models: ['gpt-image-2'] }],
  skills: [{ slug: 'image-generation' }],
  env: { OPENAI_API_KEY: 'sk-test' },
})
assert.equal(nameOnlyGptImage.modelConfigured, true)
assert.equal(nameOnlyGptImage.apiKeyConfigured, true)
assert.equal(nameOnlyGptImage.endpointCallable, false)
assert.equal(nameOnlyGptImage.capabilityReady, false)

const ready = buildHermesImageCapabilityStatus({
  effectiveModelConfig: {
    status: 'ready',
    provider: 'openai',
    model: 'gpt-image-2',
    apiKeyConfigured: true,
  },
  providers: [{
    id: 'openai',
    imageAdapter: 'openai-image',
    models: [{
      id: 'gpt-image-2',
      capabilities: { chat: true, image_generation: true, image_edit: true, vision: true },
    }],
  }],
  skills: [{ slug: 'image-generation' }],
  env: { OPENAI_API_KEY: 'sk-test' },
})
assert.equal(ready.endpointCallable, true)
assert.equal(ready.capabilityReady, true)
const readyReply = formatHermesImageCapabilityReply(ready)
assert.match(readyReply, /图片能力检查：当前可用/)
assert.match(readyReply, /识图=可用，文生图=可用，图生图=可用/)

const fallbackReply = formatHermesImageCapabilityReadFailureReply()
assert.match(fallbackReply, /暂时无法读取图片能力配置/)
assert.match(fallbackReply, /继续普通聊天/)
assert.doesNotMatch(fallbackReply, /�|鍥|鐢|鏂|鑳|锛|銆/)
assert.doesNotMatch(fallbackReply, /Error|stack trace|at\s+\w|formatHermes|buildHermes|getEffectiveModelConfig/i)
assert.doesNotMatch(fallbackReply, /capabilityReady[：:=]\s*(?:是|true)/i)
assert.doesNotMatch(fallbackReply, /fetch\(|image_generation|image_edit|\/images|\/generations/i)
console.log('HERMES_IMAGE_CAPABILITY_FALLBACK_CLEAN: PASS')

console.log('smoke-hermes-image-capability-status PASS')
