import { guardLifeAction } from '../shared/life-assistant-guard.js'
import { createScreenshotCard, LifeTaskKind } from '../shared/life-assistant-types.js'

export async function runLifeDesktopAssist(input = {}, context = {}) {
  const task = normalizeLifeTask(input)

  context.emit?.({
    role: 'assistant',
    type: 'status',
    content: `正在处理：${task.intent}`,
  })

  const plan = buildPlan(task)
  for (const step of plan.steps) {
    const guard = guardLifeAction(step)
    if (!guard.allowed) {
      context.emit?.({
        role: 'assistant',
        type: 'user_confirmation',
        confirmation: guard.confirmation,
      })
      return {
        ok: false,
        blocked: true,
        reason: guard.reason,
        confirmation: guard.confirmation,
      }
    }

    await executeLowRiskStep(step, context)
  }

  if (task.requireScreenshot) {
    const shot = await captureCurrentPageScreenshot(context)
    if (shot?.imageUrl) {
      const card = createScreenshotCard({
        title: shot.title || '当前页面截图',
        imageUrl: shot.imageUrl,
        source: shot.source || '浏览器',
        note: shot.note || '已截取当前页面，供你确认。',
      })
      context.emit?.({
        role: 'assistant',
        type: 'screenshot_card',
        card,
      })
    } else {
      context.emit?.({
        role: 'assistant',
        type: 'status',
        content: '当前运行环境没有可用的浏览器截图上下文，未生成截图。',
      })
    }
  }

  return {
    ok: true,
    summary: '已完成当前低风险代办步骤。',
  }
}

export function normalizeLifeTask(input = {}) {
  return {
    intent: input.intent || LifeTaskKind.LOOK_AT_PAGE,
    query: input.query || '',
    requireScreenshot: input.requireScreenshot !== false,
    stopBeforePayment: input.stopBeforePayment !== false,
  }
}

export function buildPlan(task) {
  if (task.intent === LifeTaskKind.ORDER_FOOD) {
    return {
      steps: [
        { type: 'open_browser', label: '打开外卖页面' },
        { type: 'read_visible_text', label: '读取当前页面' },
        { type: 'find_coupon', label: '查找可用优惠' },
        task.stopBeforePayment
          ? { type: 'submit_order', label: '提交订单前确认', platform: '外卖平台' }
          : { type: 'prepare_order', label: '准备订单，但不付款' },
      ],
    }
  }

  if (task.intent === LifeTaskKind.FIND_COUPON) {
    return {
      steps: [
        { type: 'read_visible_text', label: '读取当前页面' },
        { type: 'find_coupon', label: '查找优惠券' },
      ],
    }
  }

  if (task.intent === LifeTaskKind.FIND_CLOTHES) {
    return {
      steps: [
        { type: 'capture_screen', label: '截取当前画面' },
        { type: 'analyze_image', label: '识别衣服款式' },
        { type: 'search_similar', label: '搜索相似款' },
      ],
    }
  }

  return {
    steps: [
      { type: 'read_visible_text', label: '读取当前页面' },
      { type: 'capture_screen', label: '截图当前页面' },
    ],
  }
}

async function executeLowRiskStep(step, context) {
  if (step.type === 'open_browser') return context.browser?.open?.()
  if (step.type === 'read_visible_text') return context.browser?.readVisibleText?.()
  if (step.type === 'capture_screen') return context.browser?.captureScreenshot?.()
  if (step.type === 'find_coupon') {
    context.emit?.({
      role: 'assistant',
      type: 'status',
      content: '正在查找页面上的优惠券、满减、红包和折扣信息。',
    })
    return null
  }
  if (step.type === 'analyze_image') {
    context.emit?.({
      role: 'assistant',
      type: 'status',
      content: '已进入图像分析步骤；MVP 先回传截图，具体识别可作为下一步处理。',
    })
    return null
  }
  if (step.type === 'search_similar') {
    context.emit?.({
      role: 'assistant',
      type: 'status',
      content: '相似款搜索作为下一步能力预留，当前不会自动购买或提交订单。',
    })
    return null
  }
  return null
}

async function captureCurrentPageScreenshot(context) {
  const result = await context.browser?.captureScreenshot?.()
  if (!result) return null
  return {
    imageUrl: result.imageUrl || result.url || result.path || '',
    title: result.title || '当前页面截图',
    source: result.source || result.url || '浏览器',
    note: result.note || '这是 OpenClaw 当前看到的页面。',
  }
}
