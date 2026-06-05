/**
 * Hermes Agent 配置编辑
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { clearModelVoiceConfigCache } from '../../../lib/model-voice.js'

const VOICE_CONFIG_MASK = '__SUPERCLAW_VOICE_KEY_MASKED__'

export function render() {
  const el = document.createElement('div')
  el.className = 'page'
  el.dataset.engine = 'hermes'
  let yaml = ''
  let loading = true
  let saving = false
  let error = ''
  let voice = null
  let voiceLoading = true
  let voiceSaving = false
  let voiceError = ''

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function draw() {
    const v = voice || {}
    const input = v.input || {}
    const output = v.output || {}
    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">HERMES AGENT · CONFIG</div>
          <h1 class="hm-hero-h1">${t('engine.hermesConfigTitle')}</h1>
          <div class="hm-hero-sub">~/.hermes/config.yaml</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-config-reload" ${loading || saving ? 'disabled' : ''}>重新加载</button>
          <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-config-save" ${loading || saving ? 'disabled' : ''}>保存配置</button>
        </div>
      </div>

      <div class="hm-panel" style="margin-bottom:16px">
        <div class="hm-panel-header">
          <div>
            <div class="hm-panel-title">语音模型</div>
            <div class="hm-muted" style="margin-top:4px">Hermes 和 OpenClaw 共用；未配置时自动使用浏览器语音兜底。</div>
          </div>
          <div class="hm-panel-actions">
            <span class="hm-muted">${voiceLoading ? '加载中...' : v.configured ? '已配置' : '未配置'}</span>
            <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-voice-save" ${voiceLoading || voiceSaving ? 'disabled' : ''}>保存语音配置</button>
          </div>
        </div>
        <div class="hm-panel-body">
          ${voiceError ? `<div style="margin-bottom:14px;padding:10px 14px;border-radius:var(--hm-radius-sm);background:var(--hm-error-soft);color:var(--hm-error);font-size:12px">${esc(voiceError)}</div>` : ''}
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">
            <label class="hm-field">
              <span>接口格式</span>
              <select id="hm-voice-format" class="hm-input">
                <option value="openai" ${v.apiFormat === 'openai' ? 'selected' : ''}>OpenAI-compatible</option>
                <option value="json" ${v.apiFormat === 'json' ? 'selected' : ''}>自定义 JSON 中转</option>
              </select>
            </label>
            <label class="hm-field">
              <span>供应商备注</span>
              <input id="hm-voice-provider" class="hm-input" value="${esc(v.provider || 'openai-compatible')}" placeholder="MiniMax / DBC / Local / Custom"/>
            </label>
            <label class="hm-field" style="grid-column:1 / -1">
              <span>Base URL</span>
              <input id="hm-voice-base" class="hm-input" value="${esc(v.baseUrl || '')}" placeholder="https://api.example.com/v1"/>
            </label>
            <label class="hm-field">
              <span>鉴权方式</span>
              <select id="hm-voice-auth-type" class="hm-input">
                <option value="bearer" ${v.authType === 'bearer' ? 'selected' : ''}>Bearer Token</option>
                <option value="header" ${v.authType === 'header' ? 'selected' : ''}>自定义 Header</option>
                <option value="none" ${v.authType === 'none' ? 'selected' : ''}>无需鉴权</option>
              </select>
            </label>
            <label class="hm-field">
              <span>Header 名称</span>
              <input id="hm-voice-auth-header" class="hm-input" value="${esc(v.authHeader || 'Authorization')}" placeholder="Authorization / x-api-key"/>
            </label>
            <label class="hm-field">
              <span>密钥环境变量</span>
              <input id="hm-voice-key-env" class="hm-input" value="${esc(v.apiKeyEnv || 'VOICE_API_KEY')}" placeholder="VOICE_API_KEY"/>
            </label>
            <label class="hm-field">
              <span>API Key</span>
              <input id="hm-voice-key" class="hm-input" type="password" value="" placeholder="${v.apiKeyMasked ? '已保存，留空保持不变' : '可选：填入语音 API Key'}"/>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px">
            <div style="border:1px solid var(--hm-border);border-radius:var(--hm-radius);padding:14px;background:var(--hm-surface-0)">
              <label style="display:flex;gap:8px;align-items:center;font-weight:700;margin-bottom:12px">
                <input id="hm-voice-input-enabled" type="checkbox" ${input.enabled ? 'checked' : ''}/> 语音输入转文字
              </label>
              <label class="hm-field"><span>转写模型</span><input id="hm-voice-input-model" class="hm-input" value="${esc(input.model || 'whisper-1')}"/></label>
              <label class="hm-field"><span>接口路径</span><input id="hm-voice-input-path" class="hm-input" value="${esc(input.path || '/audio/transcriptions')}"/></label>
              <label class="hm-field"><span>语言</span><input id="hm-voice-input-language" class="hm-input" value="${esc(input.language || 'zh-CN')}"/></label>
            </div>
            <div style="border:1px solid var(--hm-border);border-radius:var(--hm-radius);padding:14px;background:var(--hm-surface-0)">
              <label style="display:flex;gap:8px;align-items:center;font-weight:700;margin-bottom:12px">
                <input id="hm-voice-output-enabled" type="checkbox" ${output.enabled ? 'checked' : ''}/> 回复语音朗读
              </label>
              <label class="hm-field"><span>合成模型</span><input id="hm-voice-output-model" class="hm-input" value="${esc(output.model || 'tts-1')}"/></label>
              <label class="hm-field"><span>接口路径</span><input id="hm-voice-output-path" class="hm-input" value="${esc(output.path || '/audio/speech')}"/></label>
              <label class="hm-field"><span>音色</span><input id="hm-voice-output-voice" class="hm-input" value="${esc(output.voice || 'alloy')}"/></label>
              <label class="hm-field"><span>格式</span><input id="hm-voice-output-format" class="hm-input" value="${esc(output.format || 'mp3')}" placeholder="mp3 / wav / opus"/></label>
            </div>
          </div>
        </div>
      </div>

      <div class="hm-panel">
        <div class="hm-panel-header">
          <div class="hm-panel-title">config.yaml</div>
          <div class="hm-panel-actions">
            <span class="hm-muted">${saving ? 'saving…' : loading ? 'loading…' : 'raw yaml editor'}</span>
          </div>
        </div>
        <div class="hm-panel-body" style="padding:0">
          ${error ? `<div style="margin:16px 18px;padding:10px 14px;border-radius:var(--hm-radius-sm);background:var(--hm-error-soft);color:var(--hm-error);font-family:var(--hm-font-mono);font-size:12px">${esc(error)}</div>` : ''}
          <textarea id="hm-config-yaml" class="hm-input" spellcheck="false" ${loading || saving ? 'disabled' : ''} style="width:100%;min-height:560px;border:0;border-radius:0;background:var(--hm-surface-0);font-family:var(--hm-font-mono);font-size:12px;line-height:1.7;padding:18px 20px;resize:vertical">${esc(yaml)}</textarea>
        </div>
      </div>
    `
    el.querySelector('#hm-config-reload')?.addEventListener('click', load)
    el.querySelector('#hm-config-save')?.addEventListener('click', save)
    el.querySelector('#hm-voice-save')?.addEventListener('click', saveVoice)
  }

  async function load() {
    loading = true
    error = ''
    draw()
    try {
      const data = await api.hermesConfigRawRead()
      yaml = data?.yaml || ''
      voiceLoading = true
      api.hermesVoiceConfigRead().then(data => {
        voice = data
        voiceError = ''
      }).catch(err => {
        voiceError = String(err?.message || err).replace(/^Error:\s*/, '')
      }).finally(() => {
        voiceLoading = false
        draw()
      })
    } catch (err) {
      error = String(err?.message || err).replace(/^Error:\s*/, '')
    } finally {
      loading = false
      draw()
    }
  }

  async function save() {
    const textarea = el.querySelector('#hm-config-yaml')
    yaml = textarea?.value || ''
    saving = true
    error = ''
    draw()
    try {
      await api.hermesConfigRawWrite(yaml)
      toast('配置已保存，建议重启 Hermes Gateway 生效', 'success')
    } catch (err) {
      error = String(err?.message || err).replace(/^Error:\s*/, '')
      toast(error, 'error')
    } finally {
      saving = false
      draw()
    }
  }

  function readField(id) {
    return el.querySelector(id)?.value?.trim() || ''
  }

  function readChecked(id) {
    return !!el.querySelector(id)?.checked
  }

  async function saveVoice() {
    const key = readField('#hm-voice-key')
    const config = {
      provider: readField('#hm-voice-provider') || 'openai-compatible',
      apiFormat: readField('#hm-voice-format') || 'openai',
      baseUrl: readField('#hm-voice-base'),
      authType: readField('#hm-voice-auth-type') || 'bearer',
      authHeader: readField('#hm-voice-auth-header') || 'Authorization',
      apiKeyEnv: readField('#hm-voice-key-env') || 'VOICE_API_KEY',
      apiKey: key || (voice?.apiKeyMasked ? VOICE_CONFIG_MASK : ''),
      input: {
        enabled: readChecked('#hm-voice-input-enabled'),
        model: readField('#hm-voice-input-model') || 'whisper-1',
        path: readField('#hm-voice-input-path') || '/audio/transcriptions',
        language: readField('#hm-voice-input-language') || 'zh-CN',
      },
      output: {
        enabled: readChecked('#hm-voice-output-enabled'),
        model: readField('#hm-voice-output-model') || 'tts-1',
        path: readField('#hm-voice-output-path') || '/audio/speech',
        voice: readField('#hm-voice-output-voice') || 'alloy',
        format: readField('#hm-voice-output-format') || 'mp3',
      },
    }
    voiceSaving = true
    voiceError = ''
    draw()
    try {
      voice = await api.hermesVoiceConfigWrite(config)
      clearModelVoiceConfigCache()
      toast('语音配置已保存', 'success')
    } catch (err) {
      voiceError = String(err?.message || err).replace(/^Error:\s*/, '')
      toast(voiceError, 'error')
    } finally {
      voiceSaving = false
      draw()
    }
  }

  draw()
  load()
  return el
}
