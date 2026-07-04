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
${extractFunctionSource('buildOpenClawCapabilitySummaryReply')}
globalThis.isOpenClawExplicitCapabilityAuditQuestion = isOpenClawExplicitCapabilityAuditQuestion
globalThis.buildOpenClawCapabilitySummaryReply = buildOpenClawCapabilitySummaryReply
`, sandbox)

const {
  isOpenClawExplicitCapabilityAuditQuestion,
  buildOpenClawCapabilitySummaryReply,
} = sandbox

assert(isOpenClawExplicitCapabilityAuditQuestion('介绍下自己现在可用 skills'), 'SKILLS_QUERY_IS_EXPLICIT_CAPABILITY')
assert(!isOpenClawExplicitCapabilityAuditQuestion('帮我截图并 OCR'), 'TASK_QUERY_IS_NOT_SKILLS_QUERY')

const reply = buildOpenClawCapabilitySummaryReply()
const required = [
  '当前可用',
  '需要 Gateway',
  '需要 Key/配置',
  '需要用户确认',
  '当前受限',
]

for (const phrase of required) {
  assert(reply.includes(phrase), `SKILLS_REPLY_INCLUDES_${phrase}`)
}

assert(!/需要我做什么|我是 OpenClaw Agent，主要负责/.test(reply), 'SKILLS_REPLY_NOT_GENERIC_TEMPLATE')

console.log('\nsmoke-openclaw-skills-answer-accuracy passed')
