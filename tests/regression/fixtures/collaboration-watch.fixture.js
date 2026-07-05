export const taskFixture = {
  task_id: 'task_watch_fixture_001',
  session_id: 'session_watch_fixture_001',
  parent_task_id: null,
  from_agent: 'hermes',
  to_agent: 'openclaw',
  message_type: 'task_request',
  status: 'created',
  title: 'Watch collaboration task',
  content: 'Create a collaboration watch task checkpoint without executing the agent.',
  context: {
    summary: 'Watch collaboration task',
    recent_messages: [],
    important_facts: ['contract fixture only', 'no real agent execution'],
    artifacts: [],
    session_id: 'session_watch_fixture_001',
    task_id: 'task_watch_fixture_001',
  },
  artifacts: [],
  mode: null,
  permission_level: 'L1',
  requires_confirmation: false,
  created_at: '2026-07-06T04:00:00.000Z',
  updated_at: '2026-07-06T04:00:01.000Z',
}

export const checkpointFixture = {
  checkpoint_id: 'checkpoint_watch_fixture_001',
  task_id: taskFixture.task_id,
  snapshot: {
    task: {
      task_id: taskFixture.task_id,
      status: 'running',
      stage: 'dispatch',
      target: 'openclaw',
    },
    agent_status: {
      agent: 'openclaw',
      status: 'running',
      heartbeat_at: '2026-07-06T04:01:00.000Z',
    },
    pending_dispatch: {
      taskId: taskFixture.task_id,
      target: 'openclaw',
      stage: 'execute',
    },
  },
  timestamp: '2026-07-06T04:01:00.000Z',
}

export const resumeFixture = {
  task_id: taskFixture.task_id,
  checkpoint_id: checkpointFixture.checkpoint_id,
  agent: 'openclaw',
  target: 'openclaw',
  requested_by: 'hermes',
  requested_at: '2026-07-06T04:05:00.000Z',
}

export const watchdogFixture = {
  task_id: taskFixture.task_id,
  last_heartbeat: '2026-07-06T04:01:00.000Z',
  now: '2026-07-06T04:11:00.000Z',
  status: 'running',
  pending_dispatch: {
    taskId: taskFixture.task_id,
    target: 'openclaw',
    stage: 'execute',
    createdAt: Date.parse('2026-07-06T04:00:00.000Z'),
  },
  agent_status: {
    agent: 'openclaw',
    status: 'offline',
    last_seen_at: '2026-07-06T04:01:00.000Z',
  },
  stale_after_ms: 300000,
}

export const stuckWatchdogFixture = {
  ...watchdogFixture,
  status: 'stuck',
}

export const offlineWatchdogFixture = {
  ...watchdogFixture,
  status: 'offline',
}

export const pendingDispatchWatchFixture = {
  taskId: taskFixture.task_id,
  session_id: taskFixture.session_id,
  target: 'openclaw',
  stage: 'execute',
  title: '[execute] OpenClaw - Watch collaboration task',
  message: 'Dispatch fixture for collaboration watchdog regression.',
  context: taskFixture.context,
  artifacts: taskFixture.artifacts,
  mode: null,
  permission_level: 'L1',
  requires_confirmation: false,
}

export const allowedWatchTaskStatuses = [
  'created',
  'running',
  'waiting_human',
  'recovering',
  'completed',
  'failed',
  'blocked',
]

export const forbiddenSensitivePaths = [
  'runtime/data/secrets',
  'src-tauri/resources/data/secrets',
  '.env',
  'relay-config.json',
]
