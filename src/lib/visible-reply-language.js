export const SIMPLIFIED_CHINESE_VISIBLE_REPLY_RULE = [
  '用户可见回复默认使用简体中文。',
  '除非用户明确要求英文或要求输出精确英文 token，否则不要用大段英文回答。',
  '代码、命令、路径、JSON/API 字段、模型名、错误码可以保留英文。',
  '不要展示内部推理、scratchpad、policy analysis、The user is asking me、Let me think 等分析过程，只输出最终结论和必要步骤。',
].join('\n')

export const PAYMENT_CODE_SAFE_REPLY_ZH =
  '可以帮你打开外卖平台、浏览店铺、选择商品、填写备注和配送信息，并停在支付确认前。但我不能截图、展示、保存或转发你的付款码，也不能替你完成最终支付。到支付环节需要你本人确认付款。'

export const CLAUDE_CODE_VISIBLE_IDENTITY_ZH =
  '我是 SuperClaw UI 中通过 Claude Panel 调用的原生 Claude Code CLI，用于代码、项目分析和开发协作。'

const REASONING_LEAK_PATTERNS = [
  /\bThe user is asking me\b/i,
  /\bThe user is asking\b/i,
  /\bLet me think\b/i,
  /\bI need to think\b/i,
  /\bHUGE red flag\b/i,
  /\bred flag\b/i,
  /\bsocial engineering\b/i,
  /\bscam attempt\b/i,
  /\binternal reasoning\b/i,
  /\bscratchpad\b/i,
  /\bpolicy analysis\b/i,
  /^\s*analysis\s*:/im,
  /^\s*\[reasoning\]/im,
]

const EXPLICIT_ENGLISH_PATTERNS = [
  /\banswer in English\b/i,
  /\breply in English\b/i,
  /\brespond in English\b/i,
  /\buse English\b/i,
  /\bEnglish only\b/i,
  /用英文(?:回答|回复|说明|输出)?/,
  /英文(?:回答|回复|说明|输出)/,
]

const EXACT_LITERAL_PATTERNS = [
  /^(?:only\s+reply|reply\s+only|just\s+reply|respond\s+only)\s+["'`]?[\w.-]{1,40}["'`]?[.!?]?\s*$/i,
  /^(?:只|仅|只需|仅需)(?:回复|输出|回答)[：:\s"'`]*[\w.-]{1,40}["'`]?[。.!?]?\s*$/,
]

function countChinese(text) {
  return (String(text || '').match(/[\u3400-\u9fff]/g) || []).length
}

function countLatinWords(text) {
  return (String(text || '').match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) || []).length
}

export function userExplicitlyRequestsEnglish(input) {
  const value = String(input || '')
  return EXPLICIT_ENGLISH_PATTERNS.some(pattern => pattern.test(value))
}

export function userRequestsExactLiteral(input) {
  const value = String(input || '').trim()
  return EXACT_LITERAL_PATTERNS.some(pattern => pattern.test(value))
}

export function detectUserPreferredLanguage(input) {
  const value = String(input || '')
  if (userExplicitlyRequestsEnglish(value)) return 'en'
  if (countChinese(value) > 0) return 'zh-CN'
  return 'zh-CN'
}

export function shouldVisibleReplyBeChinese(input, context = {}) {
  if (context?.allowEnglish === true) return false
  if (userExplicitlyRequestsEnglish(input)) return false
  if (userRequestsExactLiteral(input)) return false
  return detectUserPreferredLanguage(input) === 'zh-CN'
}

export function containsReasoningLeak(text) {
  const value = String(text || '')
  return REASONING_LEAK_PATTERNS.some(pattern => pattern.test(value))
}

export function isMostlyEnglishVisibleText(text) {
  const value = String(text || '')
  const latinWords = countLatinWords(value)
  const chineseChars = countChinese(value)
  if (latinWords < 18) return false
  if (/```|^\s*(?:npm|node|git|powershell|curl|GET|POST|HTTP)\b/im.test(value)) return false
  return chineseChars < Math.max(4, Math.floor(latinWords / 3))
}

export function isPaymentCodeRequest(input, reply = '') {
  const value = `${input || ''}\n${reply || ''}`
  return /(付款码|支付码|收款码|payment\s*code|qr\s*code|screenshot\s*payment)/i.test(value)
}

export function isIdentityQuestion(input) {
  const value = String(input || '')
  return /(你是谁|你是什么|你叫什么|说明你的身份|身份定位|介绍下自己|自我介绍|你能做什么|你的能力|能力和定位|who are you|what are you|introduce yourself|what can you do)/i.test(value)
}

export function looksLikeModelIdentityAnswer(reply) {
  const value = String(reply || '')
  if (!value) return false
  if (/Claude\s*Code|Claude\s*Panel|SuperClaw\s*UI|代码.*(?:助手|协作)|项目.*(?:分析|协作)/i.test(value)) {
    return false
  }
  return /(?:我是|我叫|我的身份是|作为|I am|I'm|my identity is).{0,48}(?:MiniMax|MiniMax-M3|GPT|gpt-[\w.-]+|Anthropic|Claude(?!\s*Code)|语言模型|大模型|AI\s*模型|模型供应商|model provider|large language model)/i.test(value)
    || /(?:MiniMax|MiniMax-M3|GPT|gpt-[\w.-]+|Anthropic|Claude(?!\s*Code)|语言模型|大模型|AI\s*模型|large language model).{0,32}(?:训练|提供|驱动|模型|assistant)/i.test(value)
}

export function sanitizeVisibleReplyForChinese(reply, input = '', options = {}) {
  const text = String(reply || '')
  if (!text) return text
  if (!shouldVisibleReplyBeChinese(input, options)) return text

  const agent = String(options.agent || '').toLowerCase()

  if (isPaymentCodeRequest(input, text)) {
    return PAYMENT_CODE_SAFE_REPLY_ZH
  }

  if (agent.includes('claude') && isIdentityQuestion(input) && (isMostlyEnglishVisibleText(text) || !countChinese(text) || looksLikeModelIdentityAnswer(text))) {
    return CLAUDE_CODE_VISIBLE_IDENTITY_ZH
  }

  if (containsReasoningLeak(text)) {
    return '我会用中文直接给结论：内部推理和风险分析过程已隐藏。请以当前任务的最终结论、必要步骤和安全边界为准；涉及高风险操作时，我会停在确认前等待你本人决定。'
  }

  if (isMostlyEnglishVisibleText(text)) {
    return '我会用中文继续说明：上游返回了较长英文内容，已避免原样展示。请重新发送一次，或明确让我把该英文结果整理成中文结论。'
  }

  return text
}
