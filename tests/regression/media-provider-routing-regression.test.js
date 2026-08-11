import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  autoDetectMediaRoutes,
  autoYyapiTextImageRoute,
  buildMediaRoutePatch,
  buildMediaRoutesForProvider,
  buildVideoEndpoints,
  buildVideoPollEndpoint,
  buildVideoRequestBody,
  emptyMediaRouteConfig,
  normalizeMediaRouteConfig,
  parseVideoPollResponse,
  parseVideoResponse,
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

test('stale media-route provider references fall back to auto-detected routes', () => {
  const openclaw = {
    models: {
      providers: {
        minimax: {
          baseUrl: 'https://api.minimaxi.com/v1',
          apiKey: 'hidden',
          models: [{ id: 'MiniMax-M3' }, { id: 'MiniMax-M2.7' }],
        },
      },
    },
  }
  // .dev-data/media/media-routes.json previously referenced minimax_cn / yyapi
  // after a provider rename. The explicit route must not hard-fail; it should
  // fall back to the auto-detected MiniMax route for the same kind.
  const staleConfig = {
    routes: {
      text_to_image: { providerId: 'yyapi', model: 'gpt-image-2', protocol: 'openai-images', enabled: true },
      text_to_video: { providerId: 'minimax_cn', model: 'MiniMax-M2.7', protocol: 'minimax-cli', enabled: true },
    },
  }
  const image = resolveMediaRoute(staleConfig, openclaw, 'text_to_image')
  assert.equal(image.ready, true)
  assert.equal(image.route.providerId, 'minimax')
  assert.equal(image.route.protocol, 'minimax-cli')
  assert.equal(image.route.model, 'MiniMax-M3')
  const video = resolveMediaRoute(staleConfig, openclaw, 'text_to_video')
  assert.equal(video.ready, true)
  assert.equal(video.route.providerId, 'minimax')
  assert.equal(video.route.model, 'MiniMax-M3')
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
  assert.equal(protocolForMediaProvider('minimax', minimax, 'text_to_image'), 'minimax-cli')
  assert.equal(protocolForMediaProvider('minimax', minimax, 'image_to_video'), 'minimax-cli')
  assert.equal(protocolForMediaProvider('minimax', minimax, 'image_to_image'), 'openai-images')
  const route = { providerId: 'minimax', model: 'MiniMax-M3', protocol: 'minimax-cli', enabled: true }
  assert.deepEqual(normalizeMediaRouteConfig({ routes: { text_to_music: route } }), { version: 1, routes: { text_to_music: route } })
  assert.throws(
    () => normalizeMediaRouteConfig({ routes: { image_to_image: route } }),
    /does not support/i,
  )
})

test('one media provider selection expands only to its supported capabilities', () => {
  const minimax = { baseUrl: 'https://api.minimaxi.com/v1', apiKey: 'hidden', models: [{ id: 'MiniMax-M3' }] }
  const routes = buildMediaRoutesForProvider('minimax', minimax, 'MiniMax-M3')
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

test('yyapi uses gpt-image-2 only as an implicit text-to-image fallback', () => {
  const yyapi = {
    models: {
      providers: {
        yyapi: {
          baseUrl: 'https://api.yaoyaolx.com.cn',
          apiKey: 'hidden',
          models: [{ id: 'gpt-5.4' }, { id: 'GPT-IMAGE-2' }],
        },
        image_provider: {
          baseUrl: 'https://example.test/v1',
          apiKey: 'hidden',
          models: [{ id: 'image-model-v1' }],
        },
      },
    },
  }
  const route = autoYyapiTextImageRoute(yyapi)
  assert.deepEqual(route, {
    providerId: 'yyapi', model: 'GPT-IMAGE-2', protocol: 'openai-images', enabled: true, implicit: true,
  })
  assert.equal(resolveMediaRoute(emptyMediaRouteConfig(), yyapi, 'text_to_image').ready, true)
  assert.equal(resolveMediaRoute(emptyMediaRouteConfig(), yyapi, 'image_to_image').ready, false)
  // An explicit route referencing an existing provider always wins over
  // auto-detection; a stale reference (provider missing) falls back instead.
  const explicit = { routes: { text_to_image: imageRoute } }
  assert.equal(resolveMediaRoute(explicit, yyapi, 'text_to_image').route.providerId, 'image_provider')
  const staleExplicit = { routes: { text_to_image: { ...imageRoute, providerId: 'renamed_provider' } } }
  assert.equal(resolveMediaRoute(staleExplicit, yyapi, 'text_to_image').route.providerId, 'yyapi')
  assert.deepEqual(buildMediaRoutesForProvider('yyapi', yyapi.models.providers.yyapi, 'gpt-image-2'), {
    text_to_image: { providerId: 'yyapi', model: 'gpt-image-2', protocol: 'openai-images', enabled: true },
  })
})

test('即梦 Seedream/Seedance auto-routes to OpenAI image/video protocols', () => {
  const config = {
    models: {
      providers: {
        yyapi: {
          baseUrl: 'https://api.yaoyaolx.com.cn/v1',
          apiKey: 'hidden',
          models: [{ id: 'gpt-5.4' }, { id: 'gpt-image-2' }],
        },
        jimeng: {
          baseUrl: 'https://jimeng.example.com/v1',
          apiKey: 'hidden',
          models: [{ id: 'doubao-seedream-4-0' }, { id: 'doubao-seedance-1-0-pro' }],
        },
      },
    },
  }
  const routes = autoDetectMediaRoutes(config)
  // gpt-image-2 wins text_to_image over Seedream
  assert.equal(routes.text_to_image.providerId, 'yyapi')
  assert.equal(routes.text_to_image.model, 'gpt-image-2')
  assert.equal(routes.text_to_image.protocol, 'openai-images')
  // Seedream covers image_to_image
  assert.deepEqual(routes.image_to_image, {
    providerId: 'jimeng', model: 'doubao-seedream-4-0', protocol: 'openai-images', enabled: true, implicit: true,
  })
  // Seedance covers video
  assert.deepEqual(routes.text_to_video, {
    providerId: 'jimeng', model: 'doubao-seedance-1-0-pro', protocol: 'openai-video', enabled: true, implicit: true,
  })
  assert.equal(routes.image_to_video.providerId, 'jimeng')
  // No speech/music/understanding synthesized for a relay-only config
  assert.equal(routes.text_to_speech, undefined)
  assert.equal(routes.text_to_music, undefined)
  // resolveMediaRoute picks up the auto-detected Seedance route
  assert.equal(resolveMediaRoute(emptyMediaRouteConfig(), config, 'text_to_video').ready, true)
})

test('即梦 alone routes both image and video when no gpt-image-2/MiniMax exists', () => {
  const config = {
    models: {
      providers: {
        jimeng: {
          baseUrl: 'https://jimeng.example.com/v1',
          apiKey: 'hidden',
          models: [{ id: 'seedream-4-0' }, { id: 'seedance-1-0-pro' }],
        },
      },
    },
  }
  const routes = autoDetectMediaRoutes(config)
  assert.equal(routes.text_to_image.protocol, 'openai-images')
  assert.equal(routes.text_to_image.model, 'seedream-4-0')
  assert.equal(routes.text_to_video.protocol, 'openai-video')
  assert.equal(routes.text_to_video.model, 'seedance-1-0-pro')
})

test('MiniMax beats Seedance for video when both are configured', () => {
  const config = {
    models: {
      providers: {
        minimax: {
          baseUrl: 'https://api.minimaxi.com/v1',
          apiKey: 'hidden',
          models: [{ id: 'MiniMax-M3' }],
        },
        jimeng: {
          baseUrl: 'https://jimeng.example.com/v1',
          apiKey: 'hidden',
          models: [{ id: 'seedance-1-0-pro' }],
        },
      },
    },
  }
  const routes = autoDetectMediaRoutes(config)
  assert.equal(routes.text_to_video.providerId, 'minimax')
  assert.equal(routes.text_to_video.protocol, 'minimax-cli')
  assert.equal(routes.image_to_video.providerId, 'minimax')
})

test('buildMediaRoutesForProvider maps Seedream and Seedance to OpenAI protocols', () => {
  const jimeng = {
    baseUrl: 'https://jimeng.example.com/v1',
    apiKey: 'hidden',
    models: [{ id: 'doubao-seedream-4-0' }, { id: 'doubao-seedance-1-0-pro' }],
  }
  assert.deepEqual(buildMediaRoutesForProvider('jimeng', jimeng, 'doubao-seedream-4-0'), {
    text_to_image: { providerId: 'jimeng', model: 'doubao-seedream-4-0', protocol: 'openai-images', enabled: true },
    image_to_image: { providerId: 'jimeng', model: 'doubao-seedream-4-0', protocol: 'openai-images', enabled: true },
  })
  assert.deepEqual(buildMediaRoutesForProvider('jimeng', jimeng, 'doubao-seedance-1-0-pro'), {
    text_to_video: { providerId: 'jimeng', model: 'doubao-seedance-1-0-pro', protocol: 'openai-video', enabled: true },
    image_to_video: { providerId: 'jimeng', model: 'doubao-seedance-1-0-pro', protocol: 'openai-video', enabled: true },
  })
})

test('OpenAI-style video adapter builds endpoints and parses async/sync responses', () => {
  assert.deepEqual(buildVideoEndpoints('https://relay.test/v1'), {
    submit: 'https://relay.test/v1/videos/generations',
    pollBase: 'https://relay.test/v1/videos/generations/',
    ark: false,
  })
  assert.deepEqual(buildVideoEndpoints('https://ark.cn-beijing.volces.com/api/v3'), {
    submit: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    pollBase: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/',
    ark: true,
  })
  assert.equal(
    buildVideoPollEndpoint('https://relay.test/v1', 'task_1'),
    'https://relay.test/v1/videos/generations/task_1',
  )
  assert.deepEqual(buildVideoRequestBody('seedance-1', 'hello'), { model: 'seedance-1', prompt: 'hello' })
  assert.deepEqual(buildVideoRequestBody('seedance-1', 'hello', { ark: true }), {
    model: 'seedance-1',
    content: [{ type: 'text', text: 'hello' }],
  })
  assert.deepEqual(parseVideoResponse({ id: 'task_1' }), { taskId: 'task_1', videoUrl: '', videoB64: '' })
  assert.deepEqual(parseVideoResponse({ data: [{ url: 'http://x/v.mp4' }] }), {
    taskId: '', videoUrl: 'http://x/v.mp4', videoB64: '',
  })
  assert.deepEqual(parseVideoPollResponse({ status: 'succeeded', data: [{ url: 'http://x/v.mp4' }] }), {
    status: 'succeeded', videoUrl: 'http://x/v.mp4', error: '',
  })
  assert.deepEqual(parseVideoPollResponse({ task_status: 'failed', error_message: 'boom' }), {
    status: 'failed', videoUrl: '', error: 'boom',
  })
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
  assert.match(chat, /Call superclaw_generate_video once with imagePath=/)
  assert.match(chat, /do not use exec, shell, filesystem search, or recursive scans/i)
  assert.match(chat, /wsClient\.chatSend\(_sessionKey, sendText, attachments/)
  assert.match(chat, /media_type === 'image_to_image' \? task : null/)
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

test('即梦 media video wiring is present in the plugin, Web debug server, and native command', () => {
  const routing = fs.readFileSync(path.join(root, 'src/lib/media-provider-routing.js'), 'utf8')
  const plugin = fs.readFileSync(path.join(root, 'src-tauri/resources/templates/openclaw-plugins/superclaw-media/index.js'), 'utf8')
  const devApi = fs.readFileSync(path.join(root, 'scripts/dev-api.js'), 'utf8')
  const media = fs.readFileSync(path.join(root, 'src-tauri/src/commands/media.rs'), 'utf8')
  // Routing lib detects 即梦 Seedream/Seedance by model-list keywords.
  assert.match(routing, /SEEDREAM_KEYWORDS = \['seedream', 'doubao-seedream'\]/)
  assert.match(routing, /SEEDANCE_KEYWORDS = \['seedance', 'doubao-seedance', 'seedans'\]/)
  assert.match(routing, /function autoDetectMediaRoutes\(openclawConfig\)/)
  assert.match(routing, /buildVideoEndpoints\(baseUrl\)/)
  // Plugin resolves via auto-detection and executes the openai-video adapter.
  assert.match(plugin, /function autoDetectMediaRoutes\(config\)/)
  assert.match(plugin, /autoDetectMediaRoutes\(config\)\[kind\]/)
  assert.match(plugin, /async function generateOpenAiVideo\(params, route\)/)
  assert.match(plugin, /route\.selected\.protocol === 'openai-video'/)
  // Web debug server shares the same auto-detection and video generation.
  assert.match(devApi, /function autoDetectMediaRoutes\(openclawConfig\)/)
  assert.match(devApi, /async function generateDevVideo\(/)
  assert.match(devApi, /normalizedKind === 'text_to_video' \|\| normalizedKind === 'image_to_video'/)
  // Native Rust command shares the same detection and run_openai_video.
  assert.match(media, /fn auto_detect_media_routes\(config: &Value\)/)
  assert.match(media, /async fn run_openai_video\(/)
  assert.match(media, /Some\("openai-video"\) if kind == "text_to_video" \|\| kind == "image_to_video"/)
})

test('media route resolution falls back when the configured provider was renamed', () => {
  // All four media-route resolution layers must agree: an explicitly-configured
  // route whose provider no longer exists (e.g. minimax_cn/yyapi -> minimax)
  // falls back to the auto-detected route instead of hard-failing.
  const routing = fs.readFileSync(path.join(root, 'src/lib/media-provider-routing.js'), 'utf8')
  const plugin = fs.readFileSync(path.join(root, 'src-tauri/resources/templates/openclaw-plugins/superclaw-media/index.js'), 'utf8')
  const devApi = fs.readFileSync(path.join(root, 'scripts/dev-api.js'), 'utf8')
  const media = fs.readFileSync(path.join(root, 'src-tauri/src/commands/media.rs'), 'utf8')
  assert.match(routing, /function mediaProviderUsable\(openclawConfig, route\)/)
  assert.match(routing, /fall back to the auto-detected route/)
  assert.match(plugin, /function providerUsable\(config, route\)/)
  assert.match(plugin, /fall back to the auto-detected route/)
  assert.match(devApi, /function mediaProviderUsable\(openclaw, route\)/)
  assert.match(devApi, /fall back to the auto-detected route/)
  assert.match(media, /fn media_provider_usable\(openclaw: &Value, route: &Value\)/)
  assert.match(media, /hard-fail media generation/)
})

test('即梦 plugin template is byte-identical across dev and packaged resource copies', () => {
  // The packaged portable bundle is assembled from src-tauri/resources, and the
  // Tauri target dirs mirror it for dev/release runs. A drift in any copy means
  // `tauri dev` and the packaged artifact would behave differently for 即梦.
  const copies = [
    'src-tauri/resources/templates/openclaw-plugins/superclaw-media/index.js',
    'src-tauri/resources/runtime/openclaw/dist/extensions/superclaw-media/index.js',
    'src-tauri/resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/extensions/superclaw-media/index.js',
    'src-tauri/target/debug/resources/templates/openclaw-plugins/superclaw-media/index.js',
    'src-tauri/target/debug/resources/runtime/openclaw/dist/extensions/superclaw-media/index.js',
    'src-tauri/target/debug/resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/extensions/superclaw-media/index.js',
    'src-tauri/target/release/resources/templates/openclaw-plugins/superclaw-media/index.js',
    'src-tauri/target/release/resources/runtime/openclaw/dist/extensions/superclaw-media/index.js',
    'src-tauri/target/release/resources/runtime/openclaw/node_modules/@qingchencloud/openclaw-zh/dist/extensions/superclaw-media/index.js',
  ]
  const template = fs.readFileSync(path.join(root, copies[0]), 'utf8')
  assert.ok(template.includes('async function generateOpenAiVideo'))
  for (const copy of copies) {
    const actual = fs.readFileSync(path.join(root, copy), 'utf8')
    assert.equal(actual, template, `plugin copy drifted from template: ${copy}`)
  }
})
