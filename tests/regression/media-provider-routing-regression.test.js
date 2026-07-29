import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildMediaRoutePatch,
  buildMediaRoutesForProvider,
  emptyMediaRouteConfig,
  normalizeMediaRouteConfig,
  protocolForMediaProvider,
  resolveMediaRoute,
  saveMediaRoute,
} from '../../src/lib/media-provider-routing.js'
import { buildOpenClawMediaTaskPrompt, detectTextToImageTask } from '../../src/lib/collaboration.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const imageRoute = {
  providerId: 'image_provider',
  model: 'image-model-v1',
  protocol: 'openai-images',
  enabled: true,
}

test('media routes are portable app data and never carry credentials', () => {
  const config = buildMediaRoutePatch(emptyMediaRouteConfig(), 'text_to_image', imageRoute)
  assert.deepEqual(config, { version: 1, routes: { text_to_image: imageRoute } })
  assert.throws(
    () => normalizeMediaRouteConfig({ routes: { text_to_image: { ...imageRoute, apiKey: 'secret' } } }),
    /must not contain credentials/i,
  )
})

test('media route resolves an existing provider without exposing its key', () => {
  const result = resolveMediaRoute(
    { routes: { text_to_image: imageRoute } },
    { models: { providers: { image_provider: { baseUrl: 'https://example.test/v1', apiKey: 'hidden', models: [{ id: 'image-model-v1' }] } } } },
    'text_to_image',
  )
  assert.equal(result.ready, true)
  assert.deepEqual(result.provider, { id: 'image_provider', baseUrl: 'https://example.test/v1', api: 'openai-completions' })
  assert.equal(JSON.stringify(result).includes('hidden'), false)
})

test('media routes do not modify OpenClaw chat primary or fallbacks', () => {
  const openclaw = {
    agents: { defaults: { model: { primary: 'yyapi/gpt-5.4', fallbacks: ['yyapi/gpt-5.5'] } } },
    models: { providers: { image_provider: { baseUrl: 'https://example.test/v1', apiKey: 'hidden', models: [{ id: 'image-model-v1' }] } } },
  }
  const before = JSON.stringify(openclaw)
  const resolved = resolveMediaRoute({ routes: { text_to_image: imageRoute } }, openclaw, 'text_to_image')
  assert.equal(resolved.ready, true)
  assert.equal(JSON.stringify(openclaw), before)
})

test('saving a media route only calls its dedicated portable config bridge', async () => {
  const calls = []
  const client = {
    mediaConfigRead: async () => emptyMediaRouteConfig(),
    mediaConfigWrite: async (config) => { calls.push(config); return { ok: true, config } },
  }
  await saveMediaRoute('text_to_image', imageRoute, client)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { version: 1, routes: { text_to_image: imageRoute } })
})

test('MiniMax uses its dedicated portable CLI adapter without changing chat routing', () => {
  const minimax = { baseUrl: 'https://api.minimaxi.com/v1', apiKey: 'hidden', models: [{ id: 'MiniMax-M3' }] }
  assert.equal(protocolForMediaProvider('minimax_cn', minimax, 'text_to_image'), 'minimax-cli')
  assert.equal(protocolForMediaProvider('minimax_cn', minimax, 'image_to_video'), 'minimax-cli')
  assert.equal(protocolForMediaProvider('minimax_cn', minimax, 'image_to_image'), 'openai-images')
  const route = { providerId: 'minimax_cn', model: 'MiniMax-M3', protocol: 'minimax-cli', enabled: true }
  assert.deepEqual(normalizeMediaRouteConfig({ routes: { text_to_music: route } }), { version: 1, routes: { text_to_music: route } })
  assert.throws(
    () => normalizeMediaRouteConfig({ routes: { image_to_image: route } }),
    /does not support/i,
  )
})

test('one media provider selection expands only to its supported capabilities', () => {
  const minimax = { baseUrl: 'https://api.minimaxi.com/v1', apiKey: 'hidden', models: [{ id: 'MiniMax-M3' }] }
  const routes = buildMediaRoutesForProvider('minimax_cn', minimax, 'MiniMax-M3')
  assert.deepEqual(Object.keys(routes).sort(), [
    'image_to_video',
    'image_understanding',
    'text_to_image',
    'text_to_music',
    'text_to_speech',
    'text_to_video',
  ])
  assert.equal(routes.text_to_image.protocol, 'minimax-cli')
  assert.equal(routes.image_to_image, undefined)
})

test('text-to-image requests become an isolated OpenClaw collaboration task', () => {
  const task = detectTextToImageTask({ text: '生成一张郑州夏日城市海报' })
  assert.deepEqual(task, {
    media_type: 'text_to_image',
    prompt: '生成一张郑州夏日城市海报',
    title: '文生图协作任务',
  })
  const prompt = buildOpenClawMediaTaskPrompt(task)
  assert.match(prompt, /superclaw_generate_image/)
  assert.match(prompt, /生成一张郑州夏日城市海报/)
  assert.equal(detectTextToImageTask({ text: '分析我上传的图片', attachments: [{ name: 'source.png' }] }), null)
})

test('photo wording routes Hermes image requests to OpenClaw instead of native tool delegation', async () => {
  const { detectMediaTask } = await import('../../src/lib/collaboration.js')
  assert.deepEqual(detectMediaTask({ text: '帮我生成一张图，金毛欢乐地跑向自己的主人' }), {
    media_type: 'text_to_image',
    prompt: '帮我生成一张图，金毛欢乐地跑向自己的主人',
    title: '文生图协作任务',
  })
  assert.equal(detectMediaTask({ text: '帮我生成一张销售图表' }), null)
  assert.deepEqual(detectMediaTask({ text: '我想要一个金毛在阳光草地上奔向主人的电影感画面' }), {
    media_type: 'text_to_image',
    prompt: '我想要一个金毛在阳光草地上奔向主人的电影感画面',
    title: '文生图协作任务',
  })
  assert.deepEqual(detectMediaTask({ text: '帮我做个赛博朋克城市夜景的 4K 壁纸' }), {
    media_type: 'text_to_image',
    prompt: '帮我做个赛博朋克城市夜景的 4K 壁纸',
    title: '文生图协作任务',
  })
  assert.equal(detectMediaTask({ text: '分析我上传的金毛图片，描述它的画面' }), null)
  assert.equal(detectMediaTask({ text: '帮我找一张金毛图片' }), null)
  assert.deepEqual(detectMediaTask({ text: '给我生成一张泰坦尼克号45度角的照片' }), {
    media_type: 'text_to_image',
    prompt: '给我生成一张泰坦尼克号45度角的照片',
    title: '文生图协作任务',
  })
  assert.deepEqual(detectMediaTask({ text: 'Create a photorealistic Titanic photo' }), {
    media_type: 'text_to_image',
    prompt: 'Create a photorealistic Titanic photo',
    title: '文生图协作任务',
  })
  assert.deepEqual(detectMediaTask({
    text: '把这张照片改成电影海报',
    attachments: [{ name: 'source.png' }],
  }), {
    media_type: 'image_to_image',
    prompt: '把这张照片改成电影海报',
    title: '图生图协作任务',
  })
})

test('Hermes desktop media requests launch the OpenClaw queue consumer without changing web debug behavior', () => {
  const source = fs.readFileSync(path.join(root, 'src/engines/hermes/lib/chat-store.js'), 'utf8')
  const chatSource = fs.readFileSync(path.join(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
  const collaboration = fs.readFileSync(path.join(root, 'src/lib/collaboration.js'), 'utf8')
  assert.match(source, /if \(isTauriRuntime\(\)\) \{[\s\S]*?openCollaborationPanel\(COLLAB_TARGETS\.openclaw, taskId/)
  assert.match(source, /reuseExisting: true/)
  assert.match(source, /focusExisting: false/)
  assert.match(collaboration, /WebviewWindow\.getAll\(\)/)
  assert.match(collaboration, /candidate\?\.label\?\.startsWith\('superclaw-openclaw-'/)
  assert.match(source, /Browser-based debugging keeps the existing manual flow/)
  assert.match(source, /function attachCollaborationResult\(taskMessage = \{\}\)/)
  assert.match(chatSource, /store\.attachCollaborationResult\(item\)/)
})

test('OpenClaw media plugin receives the exact desktop media configuration path', () => {
  const utils = fs.readFileSync(path.join(root, 'src-tauri/src/utils.rs'), 'utf8')
  const plugin = fs.readFileSync(path.join(root, 'src-tauri/resources/templates/openclaw-plugins/superclaw-media/index.js'), 'utf8')
  const media = fs.readFileSync(path.join(root, 'src-tauri/src/commands/media.rs'), 'utf8')
  assert.match(utils, /SUPERCLAW_MEDIA_CONFIG_PATH/)
  assert.match(plugin, /process\.env\.SUPERCLAW_MEDIA_CONFIG_PATH/)
  assert.match(media, /super::media_config_path\(\)/)
})

test('OpenClaw media tool failures are returned to Hermes as failed collaboration tasks', () => {
  const chat = fs.readFileSync(path.join(root, 'src/pages/chat.js'), 'utf8')
  assert.match(chat, /failed: getOpenClawToolResultInfo\(finalTools\.length \? finalTools : _currentAiTools/)
})

test('OpenClaw image-to-video stays on the durable Gateway history path', () => {
  const chat = fs.readFileSync(path.join(root, 'src/pages/chat.js'), 'utf8')
  assert.match(chat, /Gateway JSONL is the authoritative OpenClaw history/)
  assert.match(chat, /Call superclaw_generate_video once with imagePath=/)
  assert.match(chat, /do not use exec, shell, filesystem search, or recursive scans/i)
  assert.match(chat, /wsClient\.chatSend\(_sessionKey, sendText, attachments/)
  assert.doesNotMatch(chat, /return \{ \.\.\.task, inputPath \}/)
})

test('development media outputs stay outside watched Tauri resources', () => {
  const commands = fs.readFileSync(path.join(root, 'src-tauri/src/commands/mod.rs'), 'utf8')
  const media = fs.readFileSync(path.join(root, 'src-tauri/src/commands/media.rs'), 'utf8')
  assert.match(commands, /pub\(crate\) fn media_output_data_dir\(\)/)
  assert.match(commands, /\.dev-data"\)\.join\("generated"\)\.join\("media"\)/)
  assert.match(media, /super::media_output_data_dir\(\)/)
  assert.doesNotMatch(media, /resources\.join\("data"\)\.join\("generated"\)\.join\("media"\)/)
})

test('media collaboration tasks execute directly and Hermes renders execution progress', () => {
  const chat = fs.readFileSync(path.join(root, 'src/pages/chat.js'), 'utf8')
  const hermesChat = fs.readFileSync(path.join(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
  assert.match(chat, /const collaborationExecutionIntent/)
  assert.match(chat, /!collaborationExecutionIntent && \(skillsIntent/)
  assert.match(hermesChat, /'task_progress'/)
})

test('OpenClaw results use the durable portable handoff and never render raw progress HTML', () => {
  const chat = fs.readFileSync(path.join(root, 'src/pages/chat.js'), 'utf8')
  const hermesChat = fs.readFileSync(path.join(root, 'src/engines/hermes/pages/chat.js'), 'utf8')
  const sharedMemory = fs.readFileSync(path.join(root, 'src-tauri/src/commands/shared_memory.rs'), 'utf8')
  assert.match(chat, /const progressMessage = createTaskProgress/)
  assert.match(chat, /api\.collaborationMessageAppend\(progressMessage\)/)
  assert.match(chat, /api\.collaborationMessageAppend\(resultMessage\)/)
  assert.match(hermesChat, /api\.collaborationMessageDrain\(COLLAB_TARGETS\.hermes\)/)
  assert.match(hermesChat, /item\.message_type === 'task_progress'\) createTaskProgress\(payload\)/)
  assert.match(hermesChat, /clearInterval\(collaborationResultPoll\)/)
  assert.match(sharedMemory, /pub fn collaboration_message_append/)
  assert.match(sharedMemory, /pub fn collaboration_message_drain/)
  assert.match(sharedMemory, /super::shared_memory_data_dir\(\)/)
})
