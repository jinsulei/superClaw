import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const COLLABORATION_PATH = path.join(root, 'src/lib/collaboration.js')
const CHAT_PATH = path.join(root, 'src/engines/hermes/pages/chat.js')

const collaborationSource = readFileSync(COLLABORATION_PATH, 'utf8')
const chatSource = readFileSync(CHAT_PATH, 'utf8')

function installBrowserShim() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  }
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: {
      origin: 'http://127.0.0.1:1420',
      pathname: '/',
      search: '',
      href: 'http://127.0.0.1:1420/#/chat',
      hostname: '127.0.0.1',
    },
  }
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type
      this.detail = init.detail
    }
  }
}

async function loadCollaborationModule() {
  installBrowserShim()
  return import('../../src/lib/collaboration.js')
}

test('OpenClaw image results keep a loadable absolute mediaPath through the collaboration handoff', async () => {
  const { createTaskResult } = await loadCollaborationModule()
  const absPath = 'C:/Users/ZXKJ/AppData/Roaming/SuperClaw/resources/data/generated/media/image-abc123.png'
  const row = createTaskResult({
    fromAgent: 'openclaw',
    toAgent: 'hermes',
    taskId: 'img-task-preserve-media-path',
    sessionId: 'sess-media-path',
    title: '文生图结果',
    content: '已生成图片',
    artifacts: [{ type: 'image', path: absPath }],
  })
  const artifact = row.artifacts[0]
  // The Hermes media loader canonicalizes `mediaPath` and validates it against
  // allowed roots. The absolute path MUST survive; stripping it to a relative
  // `media/image-*.png` made the generated image unrenderable in the chat.
  assert.equal(artifact.mediaPath, absPath)
  // The `path` label stays stripped for display, matching existing behavior.
  assert.equal(artifact.path, 'data/generated/media/image-abc123.png')
  assert.equal(artifact.type, 'image')
  // The context (what a dispatched/resumed task consumes) also keeps it.
  assert.equal(row.context.artifacts[0].mediaPath, absPath)
})

test('non-image file artifacts are not given a synthetic absolute mediaPath', async () => {
  const { createTaskResult } = await loadCollaborationModule()
  const row = createTaskResult({
    fromAgent: 'openclaw',
    toAgent: 'hermes',
    taskId: 'img-task-non-image',
    sessionId: 'sess-non-image',
    title: '文件结果',
    content: '已生成文件',
    artifacts: [{ type: 'file', path: 'C:/Some/Path/artifacts/report.txt' }],
  })
  const artifact = row.artifacts[0]
  assert.equal(artifact.type, 'file')
  // Non-image artifacts keep the previous behavior: no synthesized mediaPath.
  assert.equal('mediaPath' in artifact, false)
  assert.equal(artifact.path, 'artifacts/report.txt')
})

test('renderHermesInboxMessages does not burn an image result when the target session message is not yet attachable', () => {
  // The inbox renderer used to mark the message processed BEFORE attaching the
  // image. If `attachCollaborationResult` failed (placeholder message not yet
  // in the session store), the generated image was permanently lost and a
  // refresh would never show it. It must instead skip (leave unprocessed) so
  // the next render retries attachment.
  assert.match(chatSource, /function inboxHasImageArtifacts\(item = \{\}\)/)
  assert.match(chatSource, /isOpenClawResult && !attachOk && inboxHasImageArtifacts\(item\)/)
  assert.match(chatSource, /\bcontinue\b[\s\S]*?renderedInboxMessages\.add\(key\)/)
  // The skip must happen BEFORE the message is marked processed.
  const skipIdx = chatSource.indexOf('inboxHasImageArtifacts(item)')
  const addIdx = chatSource.indexOf('renderedInboxMessages.add(key)')
  assert.ok(skipIdx >= 0 && addIdx > skipIdx, 'image-attach skip must precede the processed marker')
})

test('normalizeArtifacts explicitly preserves the absolute path as mediaPath for image artifacts', () => {
  assert.match(collaborationSource, /isImageArtifact && isAbsolutePath\(rawPath\)/)
  assert.match(collaborationSource, /mediaPath = isAbsolutePath\(rawMediaPath\) \? rawMediaPath : rawPath/)
  assert.match(collaborationSource, /generated image unrenderable in the chat/)
})
