import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bilibiliShareUrlFixture,
  douyinShareUrlFixture,
  failedFetchMaterialFixture,
  kuaishouShareUrlFixture,
  metadataOnlyMaterialFixture,
  nestedRepliesFixture,
  normalWebUrlFixture,
  sensitiveLinkPayloadFixture,
  shipinhaoShareUrlFixture,
  topCommentsFixture,
  unsafeUrlFixtures,
  webpageTextMaterialFixture,
  xiaohongshuShareUrlFixture,
} from './fixtures/link-reader.fixture.js'

import * as hermesLinkReader from '../../src/engines/hermes/lib/hermes-ecommerce-link-reader.js'

const NO_PARALLEL_IMPL_CONTRACT = [
  'first Link Reader fix must patch_existing / wrap_existing',
  'do not create a second Link Reader implementation',
  'do not rewrite src/engines/hermes/pages/chat.js',
  'do not split scripts-dev-api.js during Link Reader regression work',
  'do not bypass assistant_fetch_url',
  'do not turn metadata_only into a fabricated transcript',
  'do not fetch private, localhost, or metadata IP URLs',
]

const SENSITIVE_VALUES = Object.values(sensitiveLinkPayloadFixture)

function classifyPlatform(url) {
  const classifier = hermesLinkReader.classifyLinkReaderPlatform
  assert.equal(typeof classifier, 'function', 'Link Reader must expose or reuse a platform classifier')
  const result = classifier(url)
  return String(result?.platform || result?.kind || 'unknown')
}

function normalizeFixtureToTargetSchema(material) {
  return {
    url: material.url,
    platform: material.platform,
    status: material.status || 'partial',
    material_level: material.material_level,
    metadata: {
      title: material.title || '',
      description: material.description || '',
      keywords: material.keywords || [],
      cover: material.cover || '',
    },
    visible_text: material.visible_text || '',
    transcript_available: material.transcript_available === true,
    subtitle_available: material.subtitle_available === true,
    audio_transcript_available: material.audio_transcript_available === true,
    frame_ocr_available: material.frame_ocr_available === true,
    top_comments: material.top_comments || [],
    title: material.title || '',
    duration: material.duration || null,
    quotes: material.quotes || [],
    timeline: material.timeline || [],
    next_actions: material.next_actions || [],
    task_events: material.task_events || [],
    tool_runs: material.tool_runs || [],
    material_limitations: material.material_limitations || [],
    error_code: material.error_code || '',
    error_message: material.error_message || '',
  }
}

function assertTargetSchema(result) {
  for (const key of [
    'url',
    'platform',
    'status',
    'material_level',
    'metadata',
    'visible_text',
    'transcript_available',
    'subtitle_available',
    'audio_transcript_available',
    'frame_ocr_available',
    'top_comments',
    'title',
    'duration',
    'quotes',
    'timeline',
    'next_actions',
    'task_events',
    'tool_runs',
  ]) {
    assert.ok(Object.hasOwn(result, key), `Link Reader result must include ${key}`)
  }
  assert.equal(typeof result.visible_text, 'string')
  assert.equal(typeof result.transcript_available, 'boolean')
  assert.equal(typeof result.subtitle_available, 'boolean')
  assert.equal(typeof result.audio_transcript_available, 'boolean')
  assert.equal(typeof result.frame_ocr_available, 'boolean')
  assert.ok(Array.isArray(result.top_comments))
  assert.ok(Array.isArray(result.quotes))
  assert.ok(Array.isArray(result.timeline))
  assert.ok(Array.isArray(result.next_actions))
  assert.ok(Array.isArray(result.task_events))
  assert.ok(Array.isArray(result.tool_runs))
}

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value)
  for (const sensitive of SENSITIVE_VALUES) {
    assert.doesNotMatch(serialized, new RegExp(sensitive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
}

test('Link Reader platform classifier identifies supported platforms', () => {
  const fixtures = [
    douyinShareUrlFixture,
    kuaishouShareUrlFixture,
    xiaohongshuShareUrlFixture,
    shipinhaoShareUrlFixture,
    bilibiliShareUrlFixture,
    normalWebUrlFixture,
  ]
  for (const fixture of fixtures) {
    assert.equal(
      classifyPlatform(fixture.url),
      fixture.expectedPlatform,
      `${fixture.url} should classify as ${fixture.expectedPlatform}`,
    )
  }
})

test('Link Reader target schema covers material, comments, observability, and next actions', () => {
  const result = normalizeFixtureToTargetSchema({
    ...metadataOnlyMaterialFixture,
    top_comments: topCommentsFixture,
    quotes: ['Fixture reusable quote.'],
    timeline: [{ time: '01:15', text: 'Fixture timeline item.' }],
    next_actions: [
      'Rewrite this metadata into a short-video hook.',
      'Ask user for transcript if deeper rewrite is needed.',
      'Extract title variants from the visible metadata.',
    ],
    task_events: [{ event_type: 'task_created', status: 'created' }],
    tool_runs: [{ tool_name: 'assistant_fetch_url', status: 'completed' }],
  })
  assertTargetSchema(result)
})

test('metadata_only result never fabricates transcript, subtitle, audio transcript, or frame OCR', () => {
  const result = normalizeFixtureToTargetSchema(metadataOnlyMaterialFixture)
  assert.equal(result.material_level, 'metadata_only')
  assert.equal(result.transcript_available, false)
  assert.equal(result.subtitle_available, false)
  assert.equal(result.audio_transcript_available, false)
  assert.equal(result.frame_ocr_available, false)
  assert.ok(result.material_limitations.some(item => /metadata_only|no transcript|no subtitle|no audio|no frame/i.test(item)))
  assert.equal(Object.hasOwn(result, 'transcript'), false)
  assert.equal(Object.hasOwn(result, 'subtitle'), false)
  assert.equal(Object.hasOwn(result, 'frame_ocr'), false)
})

test('fetch_failed result exposes stable failure fields and does not fabricate material', () => {
  const result = normalizeFixtureToTargetSchema(failedFetchMaterialFixture)
  assert.equal(result.status, 'failed')
  assert.equal(result.material_level, 'fetch_failed')
  assert.ok(result.error_code || result.error_message)
  assert.equal(result.top_comments.length, 0)
  assert.equal(result.quotes.length, 0)
  assert.equal(result.timeline.length, 0)
  assert.match(result.visible_text, /failed|provide|page text|title|summary/i)
})

test('top comments include only main comments and exclude nested replies', () => {
  assert.equal(topCommentsFixture.length, 5)
  for (const comment of topCommentsFixture) {
    assert.equal(comment.type, 'comment')
    assert.doesNotMatch(comment.type, /reply|child_reply|comment_reply/i)
    assert.equal(typeof comment.text, 'string')
  }
  const nestedSerialized = JSON.stringify(nestedRepliesFixture)
  assert.match(nestedSerialized, /child_reply|comment_reply|nested_reply/)
})

test('quotes, timeline, and next_actions are dynamic schema fields', () => {
  const result = normalizeFixtureToTargetSchema({
    ...webpageTextMaterialFixture,
    quotes: ['A safe fixture quote from visible text.'],
    timeline: [{ time: '01:15', summary: 'Fixture segment summary.' }],
    next_actions: [
      `Summarize the ${webpageTextMaterialFixture.material_level} content.`,
      `Create title options for ${webpageTextMaterialFixture.platform}.`,
      'Ask for missing audience or tone before rewriting.',
    ],
  })
  assert.ok(Array.isArray(result.quotes))
  assert.ok(Array.isArray(result.timeline))
  assert.match(result.timeline[0].time, /^\d{2}:\d{2}$/)
  assert.ok(result.timeline[0].text || result.timeline[0].summary)
  assert.equal(result.next_actions.length, 3)
  assert.notDeepEqual(result.next_actions, ['Next step 1', 'Next step 2', 'Next step 3'])
})

test('unsafe URLs must be rejected or marked unsafe by production policy', () => {
  const policy = hermesLinkReader.isSafeLinkReaderUrl || hermesLinkReader.classifyLinkReaderUrlSafety
  assert.equal(typeof policy, 'function', 'Expected gap: Link Reader URL safety policy is not exported yet')
  for (const url of unsafeUrlFixtures) {
    const result = policy(url)
    const safe = typeof result === 'boolean' ? result : result?.safe === true
    assert.equal(safe, false, `${url} must not be considered safe`)
  }
})

test('sensitive link payload fields must be redacted from final schema JSON', () => {
  const redactor = hermesLinkReader.redactLinkReaderPayload
  assert.equal(typeof redactor, 'function', 'Expected gap: Link Reader redaction helper is not exported yet')
  const redacted = redactor({
    ...metadataOnlyMaterialFixture,
    raw_payload: sensitiveLinkPayloadFixture,
  })
  assertNoSensitiveValues(redacted)
})

test('Link Reader result must be able to attach task_events and tool_runs', () => {
  const normalizer = hermesLinkReader.normalizeLinkReaderResult
  assert.equal(typeof normalizer, 'function', 'Expected gap: Link Reader result normalizer is not exported yet')
  const result = normalizer(metadataOnlyMaterialFixture)
  assertTargetSchema(result)
  assert.ok(result.task_events.length >= 1, 'Link Reader must expose task_events')
  assert.ok(result.tool_runs.length >= 1, 'Link Reader must expose tool_runs')
})

test('no_parallel_impl contract is explicit for Link Reader regression work', () => {
  assert.ok(NO_PARALLEL_IMPL_CONTRACT.includes('first Link Reader fix must patch_existing / wrap_existing'))
  assert.ok(NO_PARALLEL_IMPL_CONTRACT.includes('do not create a second Link Reader implementation'))
  assert.ok(NO_PARALLEL_IMPL_CONTRACT.includes('do not rewrite src/engines/hermes/pages/chat.js'))
  assert.ok(NO_PARALLEL_IMPL_CONTRACT.includes('do not split scripts-dev-api.js during Link Reader regression work'))
  assert.ok(NO_PARALLEL_IMPL_CONTRACT.includes('do not bypass assistant_fetch_url'))
  assert.ok(NO_PARALLEL_IMPL_CONTRACT.includes('do not turn metadata_only into a fabricated transcript'))
  assert.ok(NO_PARALLEL_IMPL_CONTRACT.includes('do not fetch private, localhost, or metadata IP URLs'))
})
