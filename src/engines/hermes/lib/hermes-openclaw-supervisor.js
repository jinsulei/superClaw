import { classifyEcommerceSafety } from '../../../shared/ecommerce/safety-policy.js'

export function buildHermesOpenClawInstruction(task = {}) {
  const goal = String(task.goal || task.text || '').trim()
  const safety = classifyEcommerceSafety(goal)
  return {
    supervisor: 'hermes',
    executor: 'openclaw',
    allowed: safety.allowed,
    reason: safety.reason,
    instruction: [
      'Use OpenClaw only for visible browser/desktop ecommerce execution.',
      'Read page state first; prefer screenshot/OCR when structured text is missing.',
      'Return concise facts, drafts, and checkpoints to Hermes.',
      'Stop before payment, order submit, publish, login, deletion, or automatic social actions.',
      goal ? `User goal: ${goal}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function summarizeHermesOpenClawStatus(events = []) {
  const list = Array.isArray(events) ? events : []
  const latest = list[list.length - 1] || null
  const failed = list.find((event) => event?.status === 'failed' || event?.ok === false)
  const completed = list.some((event) => event?.status === 'completed' || event?.type === 'completed')
  return {
    supervisor: 'hermes',
    executor: 'openclaw',
    status: failed ? 'failed' : completed ? 'completed' : latest ? 'running' : 'not_started',
    latestType: latest?.type || latest?.status || null,
    eventCount: list.length,
  }
}

export function createHermesOpenClawSupervisionTask(text = '', options = {}) {
  const instruction = buildHermesOpenClawInstruction({ goal: text })
  return {
    type: 'hermes_openclaw_supervision',
    supervisor: 'hermes',
    executor: 'openclaw',
    taskId: options.taskId || `hoc-${Date.now().toString(36)}`,
    allowed: instruction.allowed,
    instruction: instruction.instruction,
    reason: instruction.reason,
    noFakeExecution: true,
  }
}

