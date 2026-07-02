import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const chat = readFileSync(resolve(root, 'src/pages/chat.js'), 'utf8')

assert.match(
  chat,
  /const\s+OPENCLAW_CHAT_VIEW_SNAPSHOT_STORAGE_KEY\s*=\s*'superclaw-openclaw-chat-view-snapshots'/,
  'OpenClaw refresh snapshot storage key is missing',
)
assert.match(
  chat,
  /const\s+OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION\s*=\s*2/,
  'OpenClaw refresh snapshots must be schema-versioned so old rendered HTML is not restored',
)
assert.match(
  chat,
  /snapshot\?\.schemaVersion !== OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION/,
  'OpenClaw snapshot pruning must drop old render-schema snapshots',
)
assert.match(
  chat,
  /function\s+writeStoredOpenClawChatViewSnapshots\s*\(snapshots\)\s*\{[\s\S]*?sessionStorage\.setItem\(OPENCLAW_CHAT_VIEW_SNAPSHOT_STORAGE_KEY/,
  'OpenClaw chat snapshot writer must persist to sessionStorage for refresh recovery',
)
assert.match(
  chat,
  /function\s+persistOpenClawChatViewSnapshot\s*\(snapshot\)\s*\{[\s\S]*?snapshots\[snapshot\.sessionKey\]\s*=\s*snapshot[\s\S]*?writeStoredOpenClawChatViewSnapshots\(snapshots\)/,
  'OpenClaw chat snapshot must be stored by session key',
)
assert.match(
  chat,
  /function\s+getOpenClawChatViewSnapshot\s*\(sessionKey\)[\s\S]*?readStoredOpenClawChatViewSnapshots\(\)\[key\][\s\S]*?_chatViewSnapshotsBySession\.set\(key,\s*storedSnapshot\)/,
  'OpenClaw restore path must fall back to stored refresh snapshot',
)
assert.match(
  chat,
  /function\s+snapshotCurrentChatState\s*\(reason = ''\)[\s\S]*?persistOpenClawChatViewSnapshot\(snapshot\)/,
  'OpenClaw snapshot creation must write the refresh snapshot',
)
assert.match(
  chat,
  /schemaVersion:\s*OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION/,
  'OpenClaw snapshot creation must persist the current render schema version',
)
assert.match(
  chat,
  /window\.addEventListener\('pagehide',\s*\(\)\s*=>\s*handleOpenClawChatSnapshotLifecycle\('pagehide'\)\)/,
  'OpenClaw must snapshot visible chat before refresh/pagehide',
)
assert.match(
  chat,
  /document\.addEventListener\('visibilitychange',[\s\S]*?visibilityState === 'hidden'[\s\S]*?handleOpenClawChatSnapshotLifecycle\('visibility-hidden'\)/,
  'OpenClaw must snapshot visible chat when the page is hidden',
)
assert.match(
  chat,
  /restoreOpenClawChatSnapshot\(snapshotSessionKey,\s*'render'\)[\s\S]*?bindOpenClawChatSnapshotLifecycle\(\)/,
  'OpenClaw render path must restore snapshot and bind lifecycle persistence',
)

console.log('OPENCLAW_REFRESH_SNAPSHOT_RESTORE: PASS')
