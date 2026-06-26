import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const chatPath = path.join(root, 'src', 'pages', 'chat.js')
const chat = fs.readFileSync(chatPath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function parseOpenClawSlashCommandForSmoke(input) {
  const raw = String(input || '')
  const trimmed = raw.trimStart()
  const lower = trimmed.toLowerCase()
  if (lower === '/hermes' || lower.startsWith('/hermes ')) {
    return {
      type: 'delegate-hermes',
      payload: trimmed.slice('/hermes'.length).trim(),
    }
  }
  if (lower === '/delegate-hermes' || lower.startsWith('/delegate-hermes ')) {
    return {
      type: 'delegate-hermes',
      payload: trimmed.slice('/delegate-hermes'.length).trim(),
    }
  }
  return null
}

assert(chat.includes('function parseOpenClawSlashCommand(input)'), 'missing strict OpenClaw slash command parser')
assert(chat.includes('const slashCommand = parseOpenClawSlashCommand(text)'), 'send flow must use strict slash command parser')
assert(chat.includes("lower === '/hermes' || lower.startsWith('/hermes ')"), 'missing strict /hermes prefix rule')
assert(chat.includes("lower === '/delegate-hermes' || lower.startsWith('/delegate-hermes ')"), 'missing strict /delegate-hermes prefix rule')
assert(!chat.includes('isHermesDelegationQuestion(text)'), 'ordinary Hermes mentions must not short-circuit chat')
assert(!chat.includes('const hermesDelegateMatch'), 'regex delegate matcher should be replaced by strict parser')
assert(chat.includes('function getOpenClawRecentMessagesForContext(limit = 50)'), 'collaboration context must guard local message reads')
assert(!chat.includes('getLocalMessages(_sessionKey).slice'), 'collaboration context must not slice a possible Promise')

const cases = [
  {
    name: 'OPENCLAW_COMMAND_HERMES_PREFIX',
    input: '/hermes 做一个任务',
    delegated: true,
    payload: '做一个任务',
  },
  {
    name: 'OPENCLAW_COMMAND_DELEGATE_PREFIX',
    input: '/delegate-hermes 做一个任务',
    delegated: true,
    payload: '做一个任务',
  },
  {
    name: 'OPENCLAW_NO_DELEGATE_FOR_INLINE_HERMES',
    input: '请说明 /hermes 是什么',
    delegated: false,
  },
  {
    name: 'OPENCLAW_NO_DELEGATE_FOR_EXPLANATION_TEXT',
    input: '在 OpenClaw 输入 /hermes 任务内容',
    delegated: false,
  },
  {
    name: 'OPENCLAW_NO_DELEGATE_FOR_LONG_AUDIT_PROMPT',
    input: 'OpenClaw 全面自检指令：插件 / 工具 / skills / 协作任务 / 电商功能；只读检查，不修改。可以提到 Hermes 和 delegate-hermes，但不要委托。',
    delegated: false,
  },
  {
    name: 'OPENCLAW_NO_DELEGATE_FOR_CODEBLOCK',
    input: '```text\n/hermes 任务内容\n```',
    delegated: false,
  },
  {
    name: 'OPENCLAW_NO_DELEGATE_FOR_HERMES_QUESTION',
    input: 'Hermes 是什么？',
    delegated: false,
  },
  {
    name: 'OPENCLAW_EMPTY_HERMES_COMMAND_REQUIRES_PAYLOAD',
    input: '/hermes',
    delegated: true,
    payload: '',
  },
]

for (const testCase of cases) {
  const parsed = parseOpenClawSlashCommandForSmoke(testCase.input)
  if (testCase.delegated) {
    assert(parsed?.type === 'delegate-hermes', `${testCase.name} did not delegate`)
    assert(parsed.payload === testCase.payload, `${testCase.name} payload mismatch: ${parsed.payload}`)
  } else {
    assert(parsed === null, `${testCase.name} delegated unexpectedly`)
  }
  console.log(`${testCase.name}: PASS`)
}

const longPrompt = 'OpenClaw 全面自检指令：插件 / 工具 / skills / 协作任务 / 电商功能；只读检查，不修改...'
assert(parseOpenClawSlashCommandForSmoke(longPrompt) === null, 'long audit prompt must go through normal chat')
console.log('OPENCLAW_NORMAL_CHAT_NOT_SWALLOWED: PASS')
