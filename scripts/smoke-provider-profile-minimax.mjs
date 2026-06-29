import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import {
  DEFAULT_MODEL_PROVIDER_PROFILE_ID,
  buildOpenClawProviderConfig,
  envForProviderProfile,
  getModelProviderProfile,
  hermesProviderIdForProfile,
  modelRefForProfile,
  normalizeProviderProfileConfig,
  openClawProviderIdForProfile,
} from '../src/lib/model-provider-profiles.js'

const cn = normalizeProviderProfileConfig({ providerId: DEFAULT_MODEL_PROVIDER_PROFILE_ID })
assert.equal(cn.providerId, 'minimax-cn')
assert.equal(cn.baseUrl, 'https://api.minimaxi.com/v1')
assert.equal(cn.model, 'MiniMax-M3')
assert.equal(openClawProviderIdForProfile(cn), 'minimax_cn')
assert.equal(hermesProviderIdForProfile(cn), 'minimax-cn')
assert.equal(modelRefForProfile(cn), 'minimax_cn/MiniMax-M3')

const openclawProvider = buildOpenClawProviderConfig(cn, 'secret-key-for-smoke')
assert.equal(openclawProvider.baseUrl, cn.baseUrl)
assert.equal(openclawProvider.api, 'openai-completions')
assert.equal(openclawProvider.apiKey, 'secret-key-for-smoke')
assert.equal(openclawProvider.models[0].id, 'MiniMax-M3')

const env = envForProviderProfile(cn, 'secret-key-for-smoke')
assert.equal(env.MINIMAX_CN_API_KEY, 'secret-key-for-smoke')
assert.equal(env.MINIMAX_CN_BASE_URL, cn.baseUrl)
assert.equal(env.OPENCLAW_MINIMAX_API_KEY, 'secret-key-for-smoke')
assert.equal(env.OPENAI_MODEL, 'MiniMax-M3')
assert.equal(env.SUPERCLAW_MODEL_PROVIDER_PROFILE, 'minimax-cn')

const intl = normalizeProviderProfileConfig({ baseUrl: 'https://api.minimax.io/v1' })
assert.equal(intl.providerId, 'minimax')
assert.equal(hermesProviderIdForProfile(intl), 'minimax')
assert.equal(getModelProviderProfile(intl.providerId).agent.managedBy, 'superclaw-provider-profile:minimax')

const devApi = fs.readFileSync(path.join(process.cwd(), 'scripts', 'dev-api.js'), 'utf8')
assert.match(devApi, /normalizeProviderProfileConfig/)
assert.match(devApi, /envForProviderProfile/)
assert.match(devApi, /managedEnvKeysForProviderProfile/)
assert.match(devApi, /superclaw-provider-profile:/)

const minimaxConfig = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'minimax-test-config.js'), 'utf8')
assert.match(minimaxConfig, /normalizeProviderProfileConfig/)
assert.match(minimaxConfig, /buildOpenClawProviderConfig/)
assert.doesNotMatch(minimaxConfig, /const PROVIDER_ID\s*=/)
assert.doesNotMatch(minimaxConfig, /const MODEL_ID\s*=/)

console.log('PROVIDER_PROFILE_MINIMAX_DEFAULT_CN: PASS')
console.log('PROVIDER_PROFILE_MINIMAX_OPENCLAW_MAPPING: PASS')
console.log('PROVIDER_PROFILE_MINIMAX_HERMES_ENV: PASS')
console.log('PROVIDER_PROFILE_MINIMAX_CLAUDE_MANAGED_BY: PASS')
