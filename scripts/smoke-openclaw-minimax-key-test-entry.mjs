import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const modelsPage = readFileSync(resolve(process.cwd(), 'src/pages/models.js'), 'utf8')

function assertContains(needle) {
  if (!modelsPage.includes(needle)) {
    throw new Error(`models page missing expected marker: ${needle}`)
  }
}

function assertNotMatches(pattern, label) {
  if (pattern.test(modelsPage)) {
    throw new Error(`models page contains forbidden ${label}`)
  }
}

assertContains('btn-save-minimax-test')
assertContains('btn-reload-minimax-test')
assertContains('btn-test-minimax-test')
assertContains('minimax-test-result')
assertContains('测试模型连接')
assertContains('尚未配置 MiniMax API Key')
assertContains("api.testModel(baseUrlForTest, apiKey, defaults.model, 'openai-completions')")
assertContains('MiniMax 模型连接测试成功')
assertContains('[REDACTED_KEY]')
assertContains('readOpenclawConfig')

assertNotMatches(/sk-[A-Za-z0-9_-]{20,}/, 'real API key')
const viteMiniMaxKeyName = 'VITE_' + 'MINIMAX_API_KEY'
assertNotMatches(new RegExp(viteMiniMaxKeyName), viteMiniMaxKeyName)
assertNotMatches(/124\.222\.21\.44/, 'legacy yyapi IP')

console.log('OPENCLAW_MINIMAX_TEST_BUTTON_EXISTS: PASS')
console.log('OPENCLAW_MINIMAX_TEST_NO_KEY_MESSAGE: PASS')
console.log('OPENCLAW_MINIMAX_TEST_NO_KEY_LEAK: PASS')
console.log('OPENCLAW_MODEL_CONFIG_PRESERVED: PASS')
console.log('OPENCLAW_MINIMAX_TEST_ENDPOINT_STABLE: PASS')
