import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { runStage56Ops } from '../../src/shared/ecommerce-stage56/runner.js'

const CHAT_PATH = 'src/engines/hermes/pages/chat.js'
const STAGE56_PATH = 'src/shared/ecommerce-stage56/runner.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const PACKAGE_PATH = 'package.json'
const TAURI_PATH = 'src-tauri/tauri.conf.json'
const OPENCLAW_RUNTIME_SENTINEL = 'src-tauri/resources/runtime/openclaw'

const chatSource = readFileSync(CHAT_PATH, 'utf8')
const stage56Source = readFileSync(STAGE56_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')
const packageSource = readFileSync(PACKAGE_PATH, 'utf8')
const tauriSource = readFileSync(TAURI_PATH, 'utf8')

const sensitiveOcrText = [
  'Customer asks: size M available?',
  'Please reply with a draft only.',
  'Phone 13800138000',
  'WeChat fixture_wechat_id',
  'token fake-token-should-be-redacted',
].join('\n')

test('Hermes Stage56 runtime bridge passes an OCR adapter instead of ocr null', () => {
  assert.match(chatSource, /\bcreateStage56HermesOcrAdapter\s*\(/)
  assert.doesNotMatch(chatSource, /runStage56Ops[\s\S]{0,260}ocr:\s*null/)
  assert.match(chatSource, /ocr:\s*createStage56HermesOcrAdapter\s*\(/)
  assert.match(chatSource, /\bextractTextFromImageData\b|\bextractTextFromImage\b/)
})

test('Hermes OCR adapter shape can feed OCR text into Stage56 WeChat metadata and draft', async () => {
  const result = await runStage56Ops({
    query: 'prepare WeChat reply draft from visible customer message',
    action_type: 'generate_reply_draft',
    task_id: 'wechat-ocr-runtime-bridge-task',
  }, {
    browser: {
      captureScreenshot: async () => ({
        imageUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
        dataUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
        mimeType: 'image/png',
      }),
      readVisibleText: async () => ({ text: '', title: 'WeChat fixture', url: 'https://example.invalid/wechat' }),
      typeIntoByHints: async () => ({ ok: true, field: 'live_reply_draft' }),
    },
    ocr: {
      imageToText: async () => sensitiveOcrText,
    },
  })

  assert.equal(result.wechat_customer_message?.platform, 'wechat')
  assert.equal(result.wechat_customer_message?.channel, 'wechat')
  assert.match(result.wechat_customer_message?.visible_text || '', /size M available/)
  assert.ok(result.reply_draft)
  assert.equal(result.reply_draft.status, 'draft')
  assert.equal(result.reply_draft.auto_send, false)
  assert.equal(result.reply_draft.requires_confirmation, true)
  const publicResult = {
    wechat_customer_message: result.wechat_customer_message,
    wechat_customer_result: result.wechat_customer_result,
    reply_draft: result.reply_draft,
    task_events: result.task_events,
    tool_runs: result.tool_runs,
  }
  assert.equal(JSON.stringify(publicResult).includes('13800138000'), false)
  assert.equal(JSON.stringify(publicResult).includes('fixture_wechat_id'), false)
  assert.equal(JSON.stringify(publicResult).includes('fake-token-should-be-redacted'), false)
})

test('Stage56 and Hermes bridge keep no-send and no-runtime boundaries', () => {
  assert.match(stage56Source, /\bFORBIDDEN_ACTIONS\b/)
  assert.match(stage56Source, /\bSEND_LIVE_REPLY\b/)
  assert.match(stage56Source, /\bPRIVATE_MESSAGE\b/)
  assert.doesNotMatch(chatSource, /\bclickByTextHints\s*\([^)]*send|send_wechat_message|send_private_message/i)
  assert.doesNotMatch(chatSource, /new\s+.*WeChat.*Runner|class\s+.*WeChat.*Runner/)
  assert.doesNotMatch(devApiSource, /wechat-ocr-runtime-bridge|createStage56HermesOcrAdapter/)
  assert.doesNotMatch(packageSource + tauriSource, /wechat-ocr-runtime-bridge|createStage56HermesOcrAdapter/)
  assert.doesNotMatch(chatSource, new RegExp(OPENCLAW_RUNTIME_SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
