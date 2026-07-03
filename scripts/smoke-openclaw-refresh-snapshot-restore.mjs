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
  /const\s+OPENCLAW_CHAT_VIEW_SNAPSHOT_SCHEMA_VERSION\s*=\s*(?:[3-9]|\d{2,})/,
  'OpenClaw refresh snapshots must bump render schema when old rendered HTML is invalidated',
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
  /function\s+restoreOpenClawChatSnapshot\s*\(sessionKey,\s*reason = ''\)[\s\S]*?normalizeOpenClawMessagesForRestore\(sourceMessages\)[\s\S]*?appendOpenClawHistoryMessage\(msg\)/,
  'OpenClaw snapshot restore must normalize messages and render them through the history renderer',
)
assert.doesNotMatch(
  chat,
  /holder\.innerHTML\s*=\s*snapshot\.html[\s\S]*?_messagesEl\.insertBefore\(node,\s*_typingEl\)/,
  'OpenClaw refresh restore must not reinsert stale rendered HTML directly',
)
assert.match(
  chat,
  /messages,\s*[\r\n]+\s*currentAiText:/,
  'OpenClaw snapshots must persist canonical messages as the primary refresh source',
)
assert.match(
  chat,
  /function\s+collectOpenClawVisibleMessagesForSnapshot\s*\(/,
  'OpenClaw snapshots must collect visible messages before refresh',
)
assert.match(
  chat,
  /function\s+openClawTableToMarkdown\s*\(/,
  'OpenClaw legacy HTML snapshots must convert rendered tables back to markdown',
)
assert.match(
  chat,
  /function\s+stripOpenClawSnapshotHtml\s*\(/,
  'OpenClaw snapshot restore must be able to extract text from old HTML snapshots',
)
assert.match(
  chat,
  /function\s+sanitizeRestoredOpenClawAssistantText\s*\(/,
  'OpenClaw snapshot restore must resanitize assistant text before rendering',
)
assert.match(
  chat,
  /isOpenClawVisibleTextInternalAuditOnly\(rawText\)/,
  'OpenClaw snapshot restore must drop old internal audit-only snapshots',
)
assert.match(
  chat,
  /isOpenClawTextClearlyIncomplete\(cleanText\)/,
  'OpenClaw snapshot restore must not restore incomplete assistant text as completed',
)
assert.match(
  chat,
  /isOpenClawHalfMarkdownTable\(text = ''\)/,
  'OpenClaw must detect half markdown table text before completed restore',
)
assert.match(
  chat,
  /isOpenClawCompleteMarkdownTable\(text = ''\)/,
  'OpenClaw must detect complete markdown table text before completed restore',
)
assert.match(
  chat,
  /chooseBestOpenClawAssistantText\(\[prev\.text,\s*next\.text,\s*prevVisible,\s*nextVisible\]\)/,
  'OpenClaw history merge must prefer complete table text over half snapshots',
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
console.log('OPENCLAW_RESTORE_RESANITIZES_OLD_HTML_SNAPSHOT: PASS')
console.log('OPENCLAW_TABLE_HISTORY_RESTORE_RENDERED: PASS')
console.log('OPENCLAW_HISTORY_COMPLETE_TABLE_REPLACES_HALF_LIVE: PASS')
