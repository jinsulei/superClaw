import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const COLLABORATION_PATH = 'src/lib/collaboration.js'
const CHAT_PATH = 'src/engines/hermes/pages/chat.js'
const DEV_API_PATH = 'scripts/dev-api.js'
const PACKAGE_PATH = 'package.json'
const TAURI_PATH = 'src-tauri/tauri.conf.json'

const collaborationSource = readFileSync(COLLABORATION_PATH, 'utf8')
const chatSource = readFileSync(CHAT_PATH, 'utf8')
const devApiSource = readFileSync(DEV_API_PATH, 'utf8')
const packageSource = readFileSync(PACKAGE_PATH, 'utf8')
const tauriSource = readFileSync(TAURI_PATH, 'utf8')

const taskId = 'resume_dispatch_task_001'
const sessionId = 'resume_dispatch_session_001'

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

function buildCheckpoint(target = 'openclaw', overrides = {}) {
  return {
    task_id: taskId,
    agents: [target],
    status: 'running',
    snapshot: {
      task: {
        task_id: taskId,
        session_id: sessionId,
        status: 'running',
        stage: 'execute',
        target,
      },
      pending_dispatch: {
        taskId,
        sessionId,
        target,
        stage: 'execute',
        title: 'Original collaboration dispatch',
        message: 'Original task brief',
        createdAt: Date.parse('2026-07-06T15:00:00.000Z'),
      },
      context: {
        summary: 'resume dispatch fixture',
        recent_messages: [{ role: 'user', content: 'original context' }],
        important_facts: ['resume must keep context'],
        artifacts: [{ type: 'file', path: 'data/artifacts/input.txt', text: 'artifact text' }],
        session_id: sessionId,
        task_id: taskId,
      },
      artifacts: [{ type: 'file', path: 'data/artifacts/input.txt', text: 'artifact text' }],
      ...overrides.snapshot,
    },
    ...overrides,
  }
}

async function assertResumeDispatchFor(target) {
  const {
    consumePendingDispatch,
    createTaskCheckpoint,
    resumeTaskFromCheckpoint,
  } = await loadCollaborationModule()

  const checkpoint = createTaskCheckpoint(buildCheckpoint(target))
  const resume = resumeTaskFromCheckpoint({
    task_id: taskId,
    checkpoint_id: checkpoint.checkpoint_id,
    target_agent: target,
    requested_by: 'hermes',
  })
  const consumed = consumePendingDispatch(target)
  const consumedAgain = consumePendingDispatch(target)

  assert.equal(resume.task_id, taskId)
  assert.equal(resume.checkpoint_id, checkpoint.checkpoint_id)
  assert.equal(resume.target_agent, target)
  assert.equal(resume.pending_dispatch?.taskId, taskId)
  assert.equal(resume.pending_dispatch?.session_id, sessionId)
  assert.equal(resume.pending_dispatch?.checkpoint_id, checkpoint.checkpoint_id)
  assert.equal(resume.pending_dispatch?.stage, 'resume')

  assert.equal(consumed.taskId, taskId, `${target} resume pending must preserve task_id`)
  assert.equal(consumed.session_id, sessionId, `${target} resume pending must preserve session_id`)
  assert.equal(consumed.checkpoint_id, checkpoint.checkpoint_id, `${target} resume pending must keep checkpoint_id`)
  assert.equal(consumed.stage, 'resume')
  assert.equal(consumed.context?.summary, 'resume dispatch fixture')
  assert.equal(consumed.artifacts?.[0]?.type, checkpoint.snapshot.artifacts[0].type)
  assert.equal(consumed.artifacts?.[0]?.path, checkpoint.snapshot.artifacts[0].path)
  assert.equal(consumed.artifacts?.[0]?.text, checkpoint.snapshot.artifacts[0].text)
  assert.equal(consumedAgain, null, `${target} resume pending must remain single-use`)
  assert.ok(resume.task_events.some(event => event.event_type === 'agent_resume_requested'))
  assert.ok(resume.task_events.some(event => event.raw_payload?.requeued === true))
  assert.ok(resume.task_events.every(event => event.event_type === 'agent_resume_requested'))
}

test('OpenClaw resume pending can be consumed once with original task and checkpoint metadata', async () => {
  await assertResumeDispatchFor('openclaw')
})

test('Claude Code resume pending can be consumed once with original task and checkpoint metadata', async () => {
  await assertResumeDispatchFor('claude-code')
})

test('dispatch:false returns resume payload and event without re-entering pending dispatch', async () => {
  const {
    consumePendingDispatch,
    createTaskCheckpoint,
    resumeTaskFromCheckpoint,
  } = await loadCollaborationModule()

  const checkpoint = createTaskCheckpoint(buildCheckpoint('openclaw'))
  const resume = resumeTaskFromCheckpoint({
    task_id: taskId,
    checkpoint_id: checkpoint.checkpoint_id,
    target_agent: 'openclaw',
    requested_by: 'hermes',
    dispatch: false,
  })

  assert.equal(resume.task_id, taskId)
  assert.equal(resume.checkpoint_id, checkpoint.checkpoint_id)
  assert.equal(resume.pending_dispatch, undefined)
  assert.equal(consumePendingDispatch('openclaw'), null)
  assert.ok(resume.task_events.some(event => event.event_type === 'agent_resume_requested'))
  assert.ok(resume.task_events.every(event => event.event_type === 'agent_resume_requested'))
})

test('resume dispatch integration stays on the existing local bridge', () => {
  assert.match(collaborationSource, /\bresumeTaskFromCheckpoint\b/)
  assert.match(collaborationSource, /\bsetPendingDispatch\b/)
  assert.match(collaborationSource, /\bconsumePendingDispatch\b/)
  assert.doesNotMatch(collaborationSource, /\bclass\s+.*ResumeRuntime\b|\bnew\s+.*ResumeRuntime\b/)
  assert.doesNotMatch(collaborationSource + chatSource, /\bsetInterval\s*\(/)
  assert.doesNotMatch(collaborationSource + chatSource, /task_resumed|task_requeued|resume_requeued/)
  assert.doesNotMatch(chatSource, /collaboration-resume-dispatch-integration|runResumeDispatch/)
  assert.doesNotMatch(devApiSource, /collaboration-resume-dispatch-integration|resumeTaskFromCheckpoint/)
  assert.doesNotMatch(packageSource + tauriSource, /collaboration-resume-dispatch-integration|resumeTaskFromCheckpoint/)
  assert.doesNotMatch(collaborationSource + chatSource, /runtime\/data\/secrets|relay-config\.json|\.env/)
})
