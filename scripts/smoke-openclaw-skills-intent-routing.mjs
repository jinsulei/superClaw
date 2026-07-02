import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('src/pages/chat.js', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`${message}: FAIL`)
    process.exitCode = 1
    return
  }
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
globalThis.isOpenClawSkillsQuestion = isOpenClawSkillsQuestion
globalThis.isOpenClawCapabilitySummaryQuestion = isOpenClawCapabilitySummaryQuestion
`, sandbox)

const {
  isOpenClawSkillsQuestion,
  isOpenClawCapabilitySummaryQuestion,
} = sandbox

assert(
  isOpenClawSkillsQuestion('介绍一下你的 skills') &&
    !isOpenClawCapabilitySummaryQuestion('介绍一下你的 skills'),
  'OPENCLAW_SKILLS_INTENT_NOT_CAPABILITY_SUMMARY',
)

assert(
  isOpenClawSkillsQuestion('你有哪些技能包？') &&
    !isOpenClawCapabilitySummaryQuestion('你有哪些技能包？'),
  'OPENCLAW_CHINESE_SKILLS_INTENT',
)

assert(
  !isOpenClawSkillsQuestion('你能做什么？') &&
    isOpenClawCapabilitySummaryQuestion('你能做什么？'),
  'OPENCLAW_GENERAL_CAPABILITY_STILL_WORKS',
)

const maybeLocalAnswer = extractFunctionSource('maybeHandleOpenClawLocalAnswer')
const skillsBranch = maybeLocalAnswer.indexOf('isOpenClawSkillsQuestion(value)')
const capabilityBranch = maybeLocalAnswer.indexOf('isOpenClawCapabilitySummaryQuestion(value)')

assert(
  skillsBranch >= 0 &&
    capabilityBranch >= 0 &&
    skillsBranch < capabilityBranch &&
    /kind:\s*['"]skills-intent['"]/.test(maybeLocalAnswer) &&
    /handled:\s*false/.test(maybeLocalAnswer.slice(skillsBranch, capabilityBranch)),
  'OPENCLAW_SKILLS_REPLY_NOT_FAKE_FALLBACK',
)

const intentPrompt = extractFunctionSource('buildIntentTriggeredToolPrompt')

assert(
  /const\s+skillsIntent\s*=\s*isOpenClawSkillsQuestion\(base\)/.test(intentPrompt) &&
    /const\s+capabilityAuditIntent\s*=\s*skillsIntent\s*\|\|/.test(intentPrompt),
  'OPENCLAW_SKILLS_ROUTE_ENTERS_TOOL_AUDIT_PROMPT',
)

assert(
  !/kind:\s*['"](?:fallback|warning)['"]/.test(maybeLocalAnswer.slice(skillsBranch, capabilityBranch)) &&
    !/appendOpenClawLocalAnswer\(.*skills/i.test(source),
  'OPENCLAW_SKILLS_REPLY_NORMAL_ASSISTANT',
)

if (process.exitCode) {
  console.error('\nsmoke-openclaw-skills-intent-routing failed')
  process.exit(process.exitCode)
}

console.log('\nsmoke-openclaw-skills-intent-routing passed')
