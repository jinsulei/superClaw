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
${extractFunctionSource('buildIntentTriggeredToolPrompt')}
globalThis.hasOpenClawConcreteTaskIntent = hasOpenClawConcreteTaskIntent
globalThis.isOpenClawExplicitCapabilityAuditQuestion = isOpenClawExplicitCapabilityAuditQuestion
globalThis.buildIntentTriggeredToolPrompt = buildIntentTriggeredToolPrompt
`, sandbox)

const {
  hasOpenClawConcreteTaskIntent,
  isOpenClawExplicitCapabilityAuditQuestion,
  buildIntentTriggeredToolPrompt,
} = sandbox

const taskInputs = [
  '帮我截图并 OCR 这张图片',
  '调用浏览器搜索这个商品并整理卖点',
  '打开这个网页并分析 https://example.com/item',
  '读取这个文件并整理重点',
  '执行这个命令并把结果汇总',
  '帮我分析商品链接',
  '帮我搜索某个信息',
]

for (const input of taskInputs) {
  const prompt = buildIntentTriggeredToolPrompt(input)
  assert(hasOpenClawConcreteTaskIntent(input), `CONCRETE_TASK_DETECTED: ${input}`)
  assert(!isOpenClawExplicitCapabilityAuditQuestion(input), `TASK_NOT_CAPABILITY_AUDIT: ${input}`)
  assert(!prompt.includes('[CAPABILITY_AUDIT_TRIGGER]'), `TASK_NO_CAPABILITY_TRIGGER: ${input}`)
}

const explicitInputs = [
  '介绍下自己现在可用 skills',
  '你有哪些能力？',
  '当前可用工具有哪些？',
]

for (const input of explicitInputs) {
  const prompt = buildIntentTriggeredToolPrompt(input)
  assert(isOpenClawExplicitCapabilityAuditQuestion(input), `EXPLICIT_CAPABILITY_DETECTED: ${input}`)
  assert(prompt.includes('[CAPABILITY_AUDIT_TRIGGER]'), `EXPLICIT_CAPABILITY_TRIGGERED: ${input}`)
}

console.log('\nsmoke-openclaw-task-routing-no-capability-hijack passed')
