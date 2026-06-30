import fs from 'node:fs'
import path from 'node:path'
import {
  buildOpenClawEcommerceVisibleReply,
  classifyOpenClawEcommerceRequest,
  shouldAnswerOpenClawEcommerceCapability,
} from '../src/engines/openclaw/lib/openclaw-ecommerce-assist.js'

const root = process.cwd()
const chatSource = fs.readFileSync(path.join(root, 'src', 'pages', 'chat.js'), 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const requiredTerms = [
  'function maybeHandleOpenClawLocalAnswer',
  'function appendOpenClawLocalAnswer',
  'function isOpenClawDirectHighRiskText',
  'function isOpenClawBrowserAutomationTraceText',
  'function buildOpenClawToolUnavailableReply',
  'function isOpenClawCapabilitySummaryQuestion',
  'function isOpenClawFinanceCapabilityQuestion',
  'function buildOpenClawFinanceCapabilityReply',
  'function buildOpenClawCapabilitySummaryReply',
  'function stripOpenClawInternalProcessText',
  'function isOpenClawFriendlyToolSummaryText',
  'function isOpenClawPlainCapabilitySummaryText',
  'function isOpenClawToolOnlySummaryText',
  'function isOpenClawInternalReasoningLeak',
  'function looksIncompleteOpenClawVisibleReply',
  'function repairIncompleteOpenClawVisibleReply',
  'function hasOpenClawExplicitRequestId',
  'function shouldIgnoreOpenClawUnboundChatEvent',
  'function scheduleOpenClawBrowserToolFallback',
  'const localAnswer = !attachments.length && !slashLikeInput ? maybeHandleOpenClawLocalAnswer(text) : { handled: false }',
  'if (localAnswer.handled)',
  'appendAiMessage(reply, new Date(now + 1)',
  'if (!(await ensureOpenClawGatewayReadyForSend())) return',
  'if (!visibleFinalText) appendToolsToEl(_currentAiBubble, finalTools.length ? finalTools : _currentAiTools)',
  "clearOpenClawGenerationState('aborted-fallback'",
  'buildOpenClawToolUnavailableReply(_lastVisibleUserText)',
  'return repairIncompleteOpenClawVisibleReply(reply, userText)',
  'skipped unbound stale OpenClaw event',
  'browser-tool-unavailable-fallback',
  'maxChars: 520',
  "kind: 'capability'",
  "kind: 'finance'",
]

for (const term of requiredTerms) {
  assert(chatSource.includes(term), `missing OpenClaw browser runtime reply guard: ${term}`)
}

const sendStart = chatSource.indexOf('async function sendMessage')
const sendEnd = chatSource.indexOf('async function doSend', sendStart)
const sendBlock = chatSource.slice(sendStart, sendEnd)

assert(sendStart >= 0 && sendEnd > sendStart, 'sendMessage block not found')
assert(
  sendBlock.indexOf('maybeHandleOpenClawLocalAnswer') < sendBlock.indexOf('ensureOpenClawGatewayReadyForSend'),
  'local safety/ecommerce answer must run before gateway-ready check',
)
assert(
  sendBlock.indexOf('parseOpenClawSlashCommand') > sendBlock.indexOf('ensureOpenClawGatewayReadyForSend'),
  'slash/delegation flow should keep the original gateway-backed send path',
)

const renderStart = chatSource.indexOf('function renderCompactAssistantContent')
const renderEnd = chatSource.indexOf('function throttledRender', renderStart)
const renderBlock = chatSource.slice(renderStart, renderEnd)
assert(renderBlock.includes('shouldRenderOpenClawToolResultCard([], rawText)'), 'tool card detection should remain explicit')
assert(
  chatSource.includes('if ((!tools || tools.length === 0) && isOpenClawFriendlyToolSummaryText(fallbackText)) return false'),
  'friendly Skills/tool summaries must not be re-rendered as raw tool cards',
)
assert(
  chatSource.includes('if ((!tools || tools.length === 0) && isOpenClawPlainCapabilitySummaryText(fallbackText)) return false'),
  'plain OpenClaw capability summaries must not be re-rendered as tool result cards',
)

const highRisk = classifyOpenClawEcommerceRequest('帮我直接付款')
assert(highRisk.blocked === true, 'direct payment must be classified as blocked high risk')

const paymentReply = buildOpenClawEcommerceVisibleReply('帮我直接付款')
assert(/不会自动执行|手动完成|手动确认/.test(paymentReply), 'payment reply must require user manual confirmation')

assert(shouldAnswerOpenClawEcommerceCapability('介绍你的电商功能') === true, 'ecommerce intro intent must be local-answerable')
const ecommerceReply = buildOpenClawEcommerceVisibleReply('介绍你的电商功能')
assert(/OpenClaw/.test(ecommerceReply), 'ecommerce capability reply must identify OpenClaw')
assert(/电商/.test(ecommerceReply), 'ecommerce capability reply must mention ecommerce')
assert(!/\|/.test(ecommerceReply), 'ecommerce capability reply must not be a markdown table fragment')

const forbiddenCrossAgentImports = [
  "from '../engines/hermes/",
  'runtime/claude-panel',
  'build-desktop-client',
]
for (const forbidden of forbiddenCrossAgentImports) {
  assert(!chatSource.includes(forbidden), `OpenClaw runtime reply fix must not depend on ${forbidden}`)
}

console.log('SMOKE_OPENCLAW_BROWSER_RUNTIME_REPLIES_PASS')
