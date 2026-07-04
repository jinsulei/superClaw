import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('src/pages/chat.js', 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`${message}: PASS`)
}

function extractFunctionSource(name) {
  const marker = `function ${name}`
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Missing function ${name}`)
  const braceStart = source.indexOf('{', start)
  if (braceStart < 0) throw new Error(`Missing function body ${name}`)
  let depth = 0
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`Unclosed function ${name}`)
}

const sandbox = {}
vm.runInNewContext(`
${extractFunctionSource('isOpenClawSkillsQuestion')}
${extractFunctionSource('isOpenClawCapabilitySummaryQuestion')}
${extractFunctionSource('hasOpenClawConcreteTaskIntent')}
${extractFunctionSource('isOpenClawExplicitCapabilityAuditQuestion')}
${extractFunctionSource('isOpenClawOcrCapabilityQuestion')}
${extractFunctionSource('buildOpenClawCapabilitySummaryReply')}
${extractFunctionSource('buildOpenClawCapabilitySummaryFallback')}
globalThis.buildOpenClawCapabilitySummaryFallback = buildOpenClawCapabilitySummaryFallback
`, sandbox)

const { buildOpenClawCapabilitySummaryFallback } = sandbox

const taskFallback = buildOpenClawCapabilitySummaryFallback(
  '帮我截图并 OCR 这张图片',
  '当前可用工具包括 OCR、browser、skill',
)
assert(taskFallback === '', 'TASK_REPLY_NOT_REPLACED_BY_CAPABILITY_SUMMARY')

const browserTaskFallback = buildOpenClawCapabilitySummaryFallback(
  '调用浏览器搜索这个商品并整理卖点',
  '工具包括 browser 和 skill_manager',
)
assert(browserTaskFallback === '', 'BROWSER_TASK_NOT_REPLACED_BY_CAPABILITY_SUMMARY')

const explicitFallback = buildOpenClawCapabilitySummaryFallback(
  '你有哪些能力？',
  '半截内容包括工具',
)
assert(
  explicitFallback.includes('当前可用') &&
    explicitFallback.includes('需要 Gateway') &&
    explicitFallback.includes('需要 Key/配置'),
  'EXPLICIT_CAPABILITY_CAN_USE_SUMMARY_FALLBACK',
)

const ocrCapabilityFallback = buildOpenClawCapabilitySummaryFallback(
  '你有 OCR 能力吗？',
  'OCR',
)
assert(
  ocrCapabilityFallback.includes('OCR') &&
    ocrCapabilityFallback.includes('识别'),
  'EXPLICIT_OCR_CAPABILITY_CAN_USE_OCR_FALLBACK',
)

console.log('\nsmoke-openclaw-capability-fallback-explicit-only passed')
