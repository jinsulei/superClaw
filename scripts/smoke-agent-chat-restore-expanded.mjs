import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compactChatMessage } from '../src/shared/compact-chat-policy.js'

const root = process.cwd()
const openclawChat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')
const hermesChat = readFileSync(resolve(root, 'src/engines/hermes/pages/chat.js'), 'utf8')

function assertContains(name, source, needle) {
  if (!source.includes(needle)) {
    throw new Error(`${name} missing expected source marker: ${needle}`)
  }
}

function assertNotContains(name, source, needle) {
  if (source.includes(needle)) {
    throw new Error(`${name} still contains forbidden source marker: ${needle}`)
  }
}

const longText = Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 行：这是一段用于验证历史长消息可折叠但默认展开的内容。`).join('\n\n')
const compact = compactChatMessage(longText)
if (!compact.collapsed) {
  throw new Error('compact policy should still mark long assistant replies as collapsible')
}

assertContains('OpenClaw chat', openclawChat, 'OPENCLAW_COMPACT_COLLAPSED_STORAGE_KEY')
assertContains('OpenClaw chat', openclawChat, 'isOpenClawManualCompactCollapsed(compactKey)')
assertContains('OpenClaw chat', openclawChat, "wrapper.classList.add(manualCollapsed ? 'is-collapsed' : 'is-expanded')")
assertContains('OpenClaw chat', openclawChat, 'renderContent(manualCollapsed ? compact.preview : compact.content)')
assertContains('OpenClaw chat', openclawChat, 'setOpenClawManualCompactCollapsed(compactKey, !expanded)')
assertContains('OpenClaw chat', openclawChat, "bubble.dataset.compactKey = meta.dedupeKey || ''")
assertContains('OpenClaw chat', openclawChat, "textEl.dataset.compactKey = renderMeta.dedupeKey || ''")

assertContains('Hermes chat', hermesChat, 'HERMES_COMPACT_COLLAPSED_STORAGE_KEY')
assertContains('Hermes chat', hermesChat, 'renderCompactAssistantHtml(rawText, messageId = \'\')')
assertContains('Hermes chat', hermesChat, 'isHermesManualCompactCollapsed(compactKey)')
assertContains('Hermes chat', hermesChat, "manualCollapsed ? 'is-collapsed' : 'is-expanded'")
assertContains('Hermes chat', hermesChat, 'data-compact-key')
assertContains('Hermes chat', hermesChat, 'setHermesManualCompactCollapsed(compactKey, !expanded)')
assertContains('Hermes chat', hermesChat, 'renderCompactAssistantHtml(visibleContent, m.id)')
assertNotContains('Hermes chat', hermesChat, "canToggle ? 'is-collapsed' : ''")

console.log('HERMES_RESTORED_LONG_TEXT_EXPANDED: PASS')
console.log('OPENCLAW_RESTORED_LONG_TEXT_EXPANDED: PASS')
console.log('USER_MANUAL_COLLAPSE_PRESERVED: PASS')
console.log('TOOL_DETAILS_CAN_STAY_COLLAPSED: PASS')
