import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const sidebarSource = fs.readFileSync(new URL('../../src/components/sidebar.js', import.meta.url), 'utf8')
const hermesChatSource = fs.readFileSync(new URL('../../src/engines/hermes/pages/chat.js', import.meta.url), 'utf8')
const hermesStoreSource = fs.readFileSync(new URL('../../src/engines/hermes/lib/chat-store.js', import.meta.url), 'utf8')

test('Hermes and OpenClaw use the compact five-entry sidebar layout', () => {
  assert.match(sidebarSource, /OPENCLAW_PRIMARY_SIDEBAR_ROUTES = \['\/chat', '\/dashboard', '\/models', '\/agents', '\/skills'\]/)
  assert.match(sidebarSource, /HERMES_PRIMARY_SIDEBAR_ROUTES = \['\/h\/chat', '\/h\/dashboard', '\/h\/skills', '\/h\/memory', '\/models'\]/)
  assert.match(sidebarSource, /const isSessionSidebar = isOpenClawSidebar \|\| isHermesSidebar/)
})

test('Hermes publishes durable session summaries to the shared sidebar', () => {
  assert.match(hermesChatSource, /superclaw-hermes-sidebar-sessions/)
  assert.match(hermesChatSource, /superclaw:hermes-sessions/)
  assert.match(hermesChatSource, /superclaw-hermes-sidebar-session-id/)
})

test('Hermes group labels are locally persisted and editable from the shared sidebar', () => {
  assert.match(hermesStoreSource, /STORAGE_GROUP_LABELS_PREFIX = 'hermes_chat_group_labels_v1_'/)
  assert.match(hermesStoreSource, /function renameGroup\(source, label\)/)
  assert.match(hermesChatSource, /type === 'rename-group'/)
  assert.match(sidebarSource, /data-hermes-group-action="rename"/)
})
