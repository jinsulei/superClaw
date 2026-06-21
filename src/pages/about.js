/**
 * 关于页面
 * 版本信息、项目链接、相关项目、系统环境
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showUpgradeModal, showConfirm, showContentModal } from '../components/modal.js'
import { setUpgrading } from '../lib/app-state.js'
import { icon, statusIcon } from '../lib/icons.js'
import { t, getLang } from '../lib/i18n.js'
import { getActiveEngineId } from '../lib/engine-manager.js'

const CLAUDE_PANEL_BASE = 'http://127.0.0.1:3020'
const SUPPORT_FETCH_TIMEOUT_MS = 1800
const DEFAULT_CONTACT_CARD = {
  name: '售后支持',
  email: '573653911@qq.com',
  qrCode: '/images/contact-qr.jpg',
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:16px">
      <div>
        <h1 class="page-title" style="margin:0">SuperClaw</h1>
        <p class="page-desc" style="margin:0">v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}</p>
      </div>
    </div>
    <div class="stat-cards" id="version-cards">
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
    </div>
    
  `

  const activeEngineId = getActiveEngineId()

  if (activeEngineId === 'xintian') {
    loadXintianData(page)
  } else if (activeEngineId === 'hermes') {
    loadHermesData(page)
  } else {
    loadData(page)
  }

  return page
}

/**
 * 心甜Claw 模式下的 about 页面：只展示 SuperClaw 自身版本 + 产品卡片，
 * 不涉及 OpenClaw 的版本切换与安装路径。
 */
async function loadXintianData(page) {
  const cards = page.querySelector('#version-cards')
  const panelVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'
  const panelUpdateHtml = `<span style="color:var(--text-tertiary)">${t('about.checkingUpdate')}</span>`
  checkNewVersion(cards, panelVersion)

  cards.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-header"><span class="stat-card-label">SuperClaw</span></div>
      <div class="stat-card-value">${panelVersion}</div>
      <div class="stat-card-meta" id="panel-update-meta" style="display:flex;align-items:center;gap:8px">${panelUpdateHtml}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header"><span class="stat-card-label">心甜Claw</span></div>
      <div class="stat-card-value" style="font-size:var(--font-size-md)">Windows</div>
      <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <a class="btn btn-primary btn-sm" href="https://xtclaw.xtnet.cc/download" target="_blank" rel="noopener" style="padding:2px 8px;font-size:var(--font-size-xs)">${t('engine.xtCtaDownloadWin')}</a>
        <a class="btn btn-secondary btn-sm" href="https://xtclaw.xtnet.cc/" target="_blank" rel="noopener" style="padding:2px 8px;font-size:var(--font-size-xs)">${t('engine.xtCtaVisitSite')}</a>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header"><span class="stat-card-label">${t('about.sectionLinks')}</span></div>
      <div class="stat-card-value" style="font-size:var(--font-size-md)">xtclaw.xtnet.cc</div>
      <div class="stat-card-meta">
        <a href="https://xtclaw.xtnet.cc/articles" target="_blank" rel="noopener" style="color:var(--accent)">${t('engine.xtFootSupport')}</a>
      </div>
    </div>
  `
}

async function loadHermesData(page) {
  const cards = page.querySelector('#version-cards')
  try {
    const [hermesInfo, openclawVersion, claudeInfo] = await Promise.all([
      api.checkHermes().catch(() => null),
      api.getVersionInfo().catch(() => null),
      api.claudeCodeStatus().catch(() => null),
    ])

    const panelVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'

    const installed = !!hermesInfo?.installed
    const gwRunning = !!hermesInfo?.gatewayRunning
    const version = hermesInfo?.hermesVersion || hermesInfo?.version || ''
    const model = hermesInfo?.model || ''
    const port = hermesInfo?.gatewayPort || 8642
    const openclawCurrent = openclawVersion?.current || panelVersion
    const openclawSource = openclawVersion?.source || openclawVersion?.cli_source || ''
    const claudeVersion = claudeInfo?.version || ''
    const claudePath = claudeInfo?.paths?.claude || ''

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    cards.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">OpenClaw</span></div>
        <div class="stat-card-value">${openclawCurrent}</div>
        <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px">${openclawSource ? esc(openclawSource) : t('about.installed')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">Hermes Agent</span></div>
        <div class="stat-card-value">${installed ? (version || t('about.installed')) : t('about.notInstalled')}</div>
        <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${gwRunning
            ? `<span style="color:var(--success)">● Gateway ${t('engine.dashRunning')} · :${port}</span>`
            : `<span style="color:var(--text-tertiary)">○ Gateway ${t('engine.dashStopped')}</span>`}
          ${model ? `<span style="color:var(--text-secondary)">${t('engine.dashModel')}: ${esc(model)}</span>` : ''}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">Claude Code</span></div>
        <div class="stat-card-value" style="font-size:var(--font-size-sm)">${claudeVersion || t('about.notInstalled')}</div>
        <div class="stat-card-meta" style="word-break:break-all">${esc(claudePath)}</div>
      </div>
    `

    page.querySelector('.about-support-wrap')?.remove()
    cards.insertAdjacentHTML('afterend', renderHermesSupportSection())
    hydrateHermesSupport(page)

    // Hermes 管理按钮事件
    if (installed) {
      // --- 配置模态框 ---
      cards.querySelector('#btn-hermes-config')?.addEventListener('click', async () => {
        try {
          const cfg = await api.hermesReadConfig()
          const maskedKey = cfg.api_key ? cfg.api_key.slice(0, 6) + '••••' + cfg.api_key.slice(-4) : t('about.notSet')
          const overlay = showContentModal({
            title: `Hermes Agent ${t('about.hermesConfig')}`,
            width: 480,
            content: `
              <div style="display:grid;gap:12px;font-size:13px;line-height:1.6">
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">${t('engine.configProvider')}:</span><span style="word-break:break-all">${esc(cfg.provider || '-')}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">Base URL:</span><span style="word-break:break-all">${esc(cfg.base_url || '-')}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">API Key:</span><span style="font-family:monospace">${esc(maskedKey)}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">${t('engine.configModel')}:</span><span style="word-break:break-all">${esc(cfg.model_raw || cfg.model || '-')}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">${t('about.hermesConfigFile')}:</span><span style="color:${cfg.config_exists ? 'var(--success)' : 'var(--warning)'}">${cfg.config_exists ? '✓' : '✗'}</span></div>
              </div>
            `,
            buttons: [
              { label: t('about.hermesGoSetup'), className: 'btn btn-primary btn-sm', id: 'btn-goto-setup' },
            ],
          })
          overlay.querySelector('#btn-goto-setup')?.addEventListener('click', () => {
            overlay.close()
            window.location.hash = '#/h/setup'
          })
        } catch (e) {
          toast(t('common.loadFailed') + ': ' + (e.message || e), 'error')
        }
      })

      cards.querySelector('#btn-hermes-services')?.addEventListener('click', () => {
        window.location.hash = '#/h/services'
      })

      // --- 升级模态框（带实时日志） ---
      cards.querySelector('#btn-hermes-upgrade')?.addEventListener('click', async () => {
        const confirmed = await showConfirm(t('about.hermesUpgradeConfirm'))
        if (!confirmed) return

        const modal = showUpgradeModal(t('about.hermesUpgrade') + ' Hermes Agent')
        modal.setProgressLabels({
          preparing: t('about.upgrading'),
          downloading: t('about.upgrading'),
          installing: t('about.upgrading'),
          done: t('about.hermesUpgradeOk', { version: '' }),
        })
        modal.setProgress(10)

        let unlisten = null
        try {
          const { listen } = await import('@tauri-apps/api/event')
          unlisten = await listen('hermes-install-log', (e) => {
            modal.appendLog(String(e.payload))
          })
        } catch (_) {}

        modal.setProgress(20)
        try {
          const ver = await api.updateHermes()
          modal.setProgress(100)
          modal.setDone(t('about.hermesUpgradeOk', { version: ver || '' }))
          modal.onClose(() => loadHermesData(page))
        } catch (e) {
          modal.appendLog(`❌ ${e.message || e}`)
          modal.setError(t('about.hermesUpgradeFail', { error: e.message || e }))
          modal.onClose(() => loadHermesData(page))
        } finally {
          if (unlisten) unlisten()
        }
      })

      // --- 卸载模态框（确认 + 实时日志） ---
      cards.querySelector('#btn-hermes-uninstall')?.addEventListener('click', async () => {
        const confirmed = await showConfirm(t('about.hermesUninstallConfirm'))
        if (!confirmed) return
        const cleanConfig = await showConfirm(t('about.hermesUninstallCleanConfig'))

        const modal = showUpgradeModal(t('about.hermesUninstall') + ' Hermes Agent')
        modal.setProgressLabels({
          preparing: t('about.uninstalling'),
          downloading: t('about.uninstalling'),
          installing: t('about.uninstalling'),
          done: t('about.hermesUninstallOk'),
        })
        modal.appendLog('🗑️ ' + t('about.uninstalling'))
        if (cleanConfig) modal.appendLog('📁 ' + t('about.hermesUninstallCleanConfigHint'))
        modal.setProgress(30)

        try {
          const result = await api.uninstallHermes(cleanConfig)
          modal.appendLog('✅ ' + (result || t('about.hermesUninstallOk')))
          modal.setProgress(100)
          modal.setDone(t('about.hermesUninstallOk'))
          modal.onClose(() => loadHermesData(page))
        } catch (e) {
          modal.appendLog(`❌ ${e.message || e}`)
          modal.setError(t('about.hermesUninstallFail', { error: e.message || e }))
          modal.onClose(() => loadHermesData(page))
        }
      })
    }
  } catch {
    cards.innerHTML = `<div class="stat-card"><div class="stat-card-label">${t('common.loadFailed')}</div></div>`
  }
}

function renderHermesSupportSection() {
  return `
    <div class="about-support-wrap">
      <div class="card about-support-card">
        <div class="card-header">
          <span class="card-header-title">联系我们</span>
        </div>
        <div class="card-body about-support-body">
          <section class="about-support-section">
            <div class="about-contact-layout">
              <div class="about-contact-qr" id="about-contact-qr">
                <img src="/images/contact-qr.jpg" alt="联系二维码">
              </div>
              <div class="about-contact-lines">
                <div class="about-contact-name" id="about-contact-name">售后支持</div>
                <div class="about-contact-line" id="about-contact-email">邮箱：573653911@qq.com</div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div class="card about-support-card">
        <div class="card-header">
          <span class="card-header-title">使用教程</span>
        </div>
        <div class="card-body about-support-body">
          <section class="about-support-section">
            <div class="about-support-kicker">飞书</div>
            <div class="about-support-title">飞书教程与协作入口</div>
            <p class="about-support-text" id="about-feishu-text">正在读取飞书链接...</p>
            <button class="btn btn-secondary about-support-action" id="btn-about-feishu" type="button" disabled>
              打开飞书链接
            </button>
          </section>
        </div>
      </div>
    </div>
  `
}

async function hydrateHermesSupport(page) {
  const [contactResult, feishuResult] = await Promise.allSettled([
    fetchPanelJson('/api/contact-card'),
    fetchPanelJson('/api/feishu-tutorial'),
  ])

  const contactData = contactResult.status === 'fulfilled' ? contactResult.value : null
  const contact = mergeContactDefaults(contactData?.contact)
  setText(page, '#about-contact-name', contact.name)
  setText(page, '#about-contact-email', `邮箱：${contact.email}`)

  const qrEl = page.querySelector('#about-contact-qr')
  const qrCode = String(contact.qrCode || '').trim()
  if (qrEl && qrCode) {
    qrEl.innerHTML = `<img src="${escapeHtml(resolveContactQrUrl(qrCode, contactData))}" alt="联系二维码">`
  }

  const feishuData = feishuResult.status === 'fulfilled' ? feishuResult.value : null
  const url = String(feishuData?.tutorialUrl || feishuData?.url || feishuData?.link || '').trim()
  const message = String(feishuData?.message || '').trim()
  const feishuText = page.querySelector('#about-feishu-text')
  const feishuBtn = page.querySelector('#btn-about-feishu')
  if (feishuText && feishuBtn) {
    if (url) {
      feishuText.textContent = message || '已配置飞书教程链接，可点击打开。'
      feishuBtn.disabled = false
      feishuBtn.addEventListener('click', () => openExternalUrl(url))
    } else {
      feishuText.textContent = message || '飞书教程链接暂未配置。'
      feishuBtn.disabled = true
    }
  }
}

async function fetchPanelJson(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUPPORT_FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(`${CLAUDE_PANEL_BASE}${path}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}

function setText(root, selector, text) {
  const el = root.querySelector(selector)
  if (el) el.textContent = text
}

function openExternalUrl(url) {
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch (err) {
    console.warn('[about] open support url failed:', err)
  }
}

function mergeContactDefaults(remoteContact) {
  const remote = remoteContact || {}
  return {
    name: String(remote.name || DEFAULT_CONTACT_CARD.name).trim(),
    email: String(remote.email || DEFAULT_CONTACT_CARD.email).trim(),
    qrCode: String(remote.qrCode || remote.qrCodeUrl || DEFAULT_CONTACT_CARD.qrCode).trim(),
  }
}

function resolveContactQrUrl(url, contactData) {
  if (url === DEFAULT_CONTACT_CARD.qrCode && !contactData?.remote) return url
  return resolvePanelAssetUrl(url)
}

function resolvePanelAssetUrl(url) {
  if (!url) return ''
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  if (url.startsWith('/')) return `${CLAUDE_PANEL_BASE}${url}`
  return `${CLAUDE_PANEL_BASE}/${url.replace(/^\.?\//, '')}`
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function loadData(page) {
  const cards = page.querySelector('#version-cards')
  try {
    const [version, install] = await Promise.all([
      api.getVersionInfo(),
      api.checkInstallation(),
    ])

    // 尝试从 Tauri API 获取 SuperClaw 自身版本号，失败则 fallback
    const panelVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'

    let panelUpdateHtml = `<span style="color:var(--text-tertiary)">${t('about.checkingUpdate')}</span>`
    checkNewVersion(cards, panelVersion)

    const isInstalled = !!version.current
    const sourceLabel = version.source === 'official' ? t('about.official') : version.source === 'chinese' ? t('about.chinese') : t('about.unknownSource')
    const btnSm = 'padding:2px 8px;font-size:var(--font-size-xs)'
    const hasRecommended = !!version.recommended
    const aheadOfRecommended = isInstalled && hasRecommended && !!version.ahead_of_recommended
    const driftFromRecommended = isInstalled && hasRecommended && !version.is_recommended && !aheadOfRecommended
    const policyRiskHint = aheadOfRecommended
      ? t('about.policyAhead', { current: version.current, recommended: version.recommended })
      : t('about.policyDefault')

    cards.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">SuperClaw</span></div>
        <div class="stat-card-value">${panelVersion}</div>
        <div class="stat-card-meta" id="panel-update-meta" style="display:flex;align-items:center;gap:8px">${panelUpdateHtml}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">OpenClaw · ${sourceLabel}</span></div>
        <div class="stat-card-value">${version.current || t('about.notInstalled')}</div>
        <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${isInstalled && hasRecommended
            ? (aheadOfRecommended
              ? `<span style="color:var(--warning,#f59e0b)">${t('about.aheadOfRecommended', { ver: version.recommended })}</span>
                 <button class="btn btn-primary btn-sm" id="btn-apply-recommended" style="${btnSm}">${t('about.rollbackToRecommended')}</button>`
              : driftFromRecommended
              ? `<span style="color:var(--accent)">${t('about.recommendedStable', { ver: version.recommended })}</span>
                 <button class="btn btn-primary btn-sm" id="btn-apply-recommended" style="${btnSm}">${t('about.switchToRecommended')}</button>`
              : `<span style="color:var(--success)">${t('about.isRecommended')}</span>`)
            : ''}
          ${version.latest_update_available && version.latest ? `<span style="color:var(--text-tertiary)">${t('about.latestUpstream', { ver: version.latest })}</span>` : ''}
          <button class="btn btn-${isInstalled ? 'secondary' : 'primary'} btn-sm" id="btn-version-mgmt" style="${btnSm}">
            ${isInstalled ? t('about.switchVersion') : t('about.installOpenclaw')}
          </button>
          ${isInstalled ? `<button class="btn btn-secondary btn-sm" id="btn-uninstall" style="${btnSm};color:var(--error)">${t('about.uninstall')}</button>` : ''}
        </div>
        <div style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6">
          ${policyRiskHint}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">${t('about.installPath')}</span></div>
        <div class="stat-card-value" style="font-size:var(--font-size-sm);word-break:break-all">${install.path || t('common.unknown')}</div>
        <div class="stat-card-meta">${install.installed ? t('about.configExists') : t('about.configNotFound')}</div>
      </div>
    `

    const applyRecommendedBtn = cards.querySelector('#btn-apply-recommended')
    if (applyRecommendedBtn && version.recommended) {
      applyRecommendedBtn.onclick = () => doInstall(page, aheadOfRecommended ? t('about.rollbackToRecommendedStable') : t('about.switchToRecommendedStable'), version.source, version.recommended)
    }

    // 版本管理 / 安装
    const versionMgmtBtn = cards.querySelector('#btn-version-mgmt')
    if (versionMgmtBtn) {
      versionMgmtBtn.onclick = () => showVersionPicker(page, version)
    }

    // 卸载
    const uninstallBtn = cards.querySelector('#btn-uninstall')
    if (uninstallBtn) {
      uninstallBtn.onclick = async () => {
        const confirmed = await showConfirm(t('about.confirmUninstall'))
        if (!confirmed) return
        const modal = showUpgradeModal(t('about.uninstallTitle'))
        modal.setProgressLabels({
          preparing: t('about.uninstallStopping'),
          downloading: t('about.uninstallRemoving'),
          installing: t('about.uninstallCleaning'),
          done: t('about.uninstallDone'),
        })
        modal.onClose(() => loadData(page))
        modal.appendLog(t('about.uninstallStarting'))
        let unlistenLog, unlistenProgress, unlistenDone, unlistenError
        const cleanup = () => { unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.() }
        try {
          if (window.__TAURI_INTERNALS__) {
            const { listen } = await import('@tauri-apps/api/event')
            unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
            unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
            unlistenDone = await listen('upgrade-done', (e) => { cleanup(); modal.setDone(typeof e.payload === 'string' ? e.payload : t('about.uninstallDone')) })
            unlistenError = await listen('upgrade-error', (e) => { cleanup(); modal.setError(t('about.uninstallFailed') + (e.payload || t('common.unknown'))) })
            await api.uninstallOpenclaw(false)
            modal.appendLog(t('about.uninstallTaskStarted'))
          } else {
            const msg = await api.uninstallOpenclaw(false)
            modal.setDone(typeof msg === 'string' ? msg : t('about.uninstallDone'))
            cleanup()
          }
        } catch (e) {
          cleanup()
          modal.setError(t('about.uninstallFailed') + (e?.message || e))
        }
      }
    }
  } catch {
    cards.innerHTML = `<div class="stat-card"><div class="stat-card-label">${t('common.loadFailed')}</div></div>`
  }
}

// 版本选择器、社区、项目、贡献、链接等板块已移除（品牌精简）
async function showVersionPicker(page, currentVersion) {
  const isInstalled = !!currentVersion.current
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-title">${isInstalled ? t('about.switchVersion') : t('about.installOpenclaw')}</div>
      <div style="display:flex;flex-direction:column;gap:16px;margin:16px 0">
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">${t('about.versionLabel')}</label>
          <div style="display:flex;gap:8px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center;transition:all .15s" id="lbl-official">
              <input type="radio" name="oc-source" value="official" ${currentVersion.source !== 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">
              ${t('about.official')}
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center;transition:all .15s" id="lbl-chinese">
              <input type="radio" name="oc-source" value="chinese" ${currentVersion.source === 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">
              ${t('about.chinese')}
            </label>
          </div>
        </div>
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">${t('about.selectVersion')}</label>
          <select id="oc-version-select" class="input" style="width:100%;padding:8px 12px;font-size:var(--font-size-sm)">
            <option value="">${t('common.loading')}</option>
          </select>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6;padding:10px 12px;border-radius:8px;background:var(--bg-tertiary)">
          ${t('about.versionPickerHint')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;min-height:18px">
          <div id="oc-action-hint" style="font-size:var(--font-size-xs);color:var(--text-tertiary)"></div>
          <div id="nightly-toggle" style="display:none"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
        <button class="btn btn-primary btn-sm" data-action="confirm" disabled id="oc-confirm-btn">${isInstalled ? t('about.btnSwitch') : t('about.btnInstall')}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const select = overlay.querySelector('#oc-version-select')
  const confirmBtn = overlay.querySelector('#oc-confirm-btn')
  const hintEl = overlay.querySelector('#oc-action-hint')
  const radios = overlay.querySelectorAll('input[name="oc-source"]')
  const lblChinese = overlay.querySelector('#lbl-chinese')
  const lblOfficial = overlay.querySelector('#lbl-official')

  const close = () => overlay.remove()
  overlay.querySelector('[data-action="cancel"]').onclick = close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })

  let versionsCache = {}
  let currentSelect = currentVersion.source === 'chinese' ? 'chinese' : 'official'

  function updateRadioStyle() {
    const sel = currentSelect
    lblChinese.style.borderColor = sel !== 'official' ? 'var(--primary)' : 'var(--border)'
    lblChinese.style.background = sel !== 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
    lblOfficial.style.borderColor = sel === 'official' ? 'var(--primary)' : 'var(--border)'
    lblOfficial.style.background = sel === 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
  }

  function updateHint() {
    const targetSource = currentSelect
    const targetVer = select.value
    if (!targetVer || targetVer === '') { hintEl.textContent = ''; confirmBtn.disabled = true; return }
    const targetTag = select.selectedIndex === 0 ? t('about.tagRecommended') : t('about.tagNeedTest')

    const sameSource = targetSource === currentVersion.source

    if (!isInstalled) {
      confirmBtn.textContent = t('about.btnInstall')
      hintEl.textContent = t('about.hintInstall', { source: targetSource === 'official' ? t('about.official') : targetSource === 'chinese' ? t('about.chinese') : t('about.unknownSource'), ver: targetVer, tag: targetTag })
      confirmBtn.disabled = false
      return
    }

    if (!sameSource) {
      confirmBtn.textContent = t('about.btnSwitch')
      hintEl.innerHTML = `${t('about.hintCurrent')}: <strong>${currentVersion.source === 'official' ? t('about.official') : currentVersion.source === 'chinese' ? t('about.chinese') : t('about.unknownSource')} ${currentVersion.current}</strong> → <strong>${targetSource === 'official' ? t('about.official') : targetSource === 'chinese' ? t('about.chinese') : t('about.unknownSource')} ${targetVer}</strong>${targetTag}`
      confirmBtn.disabled = false
      return
    }

    // 同源，比较版本
    const parseVer = v => v.split(/[^0-9]/).filter(Boolean).map(Number)
    const cur = parseVer(currentVersion.current)
    const tgt = parseVer(targetVer)
    let cmp = 0
    for (let i = 0; i < Math.max(cur.length, tgt.length); i++) {
      if ((tgt[i] || 0) > (cur[i] || 0)) { cmp = 1; break }
      if ((tgt[i] || 0) < (cur[i] || 0)) { cmp = -1; break }
    }

    if (cmp === 0) {
      confirmBtn.textContent = t('about.btnReinstall')
      hintEl.textContent = t('about.hintAlreadyVersion', { ver: targetVer, tag: targetTag })
      confirmBtn.disabled = false
    } else if (cmp > 0) {
      confirmBtn.textContent = t('about.btnUpgrade')
      hintEl.innerHTML = `<span style="color:var(--accent)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    } else {
      confirmBtn.textContent = t('about.btnDowngrade')
      hintEl.innerHTML = `<span style="color:var(--warning,#f59e0b)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    }
  }

  let showNightly = false

  async function loadVersions(source) {
    select.innerHTML = `<option value="">${t('common.loading')}</option>`
    confirmBtn.disabled = true
    hintEl.textContent = ''
    try {
      if (!versionsCache[source]) {
        versionsCache[source] = await api.listOpenclawVersions(source)
      }
      const allVersions = versionsCache[source]
      if (!allVersions.length) {
        select.innerHTML = `<option value="">${t('about.noVersions')}</option>`
        return
      }
      const stable = allVersions.filter(v => !v.includes('nightly') && !v.includes('canary') && !v.includes('alpha') && !v.includes('beta') && !v.includes('rc') && !v.includes('dev') && !v.includes('next'))
      const versions = showNightly ? allVersions : (stable.length > 0 ? stable : allVersions)
      const nightlyCount = allVersions.length - stable.length
      select.innerHTML = versions.map((v, idx) => {
        const isCurrent = isInstalled && v === currentVersion.current && source === currentVersion.source
        return `<option value="${v}">${v}${idx === 0 ? ` (${t('about.recommended')})` : ''}${isCurrent ? ` (${t('about.current')})` : ''}</option>`
      }).join('')
      // nightly 切换提示
      const toggleEl = overlay.querySelector('#nightly-toggle')
      if (toggleEl) {
        if (nightlyCount > 0) {
          toggleEl.style.display = ''
          toggleEl.innerHTML = showNightly
            ? `<a href="#" id="btn-toggle-nightly" style="color:var(--primary);text-decoration:none;font-size:var(--font-size-xs)">${t('about.hidePreview', { count: nightlyCount })}</a>`
            : `<a href="#" id="btn-toggle-nightly" style="color:var(--text-tertiary);text-decoration:none;font-size:var(--font-size-xs)">${t('about.showPreview', { count: nightlyCount })}</a>`
          toggleEl.querySelector('#btn-toggle-nightly').onclick = (e) => { e.preventDefault(); showNightly = !showNightly; loadVersions(source) }
        } else {
          toggleEl.style.display = 'none'
        }
      }
      updateHint()
    } catch (e) {
      select.innerHTML = `<option value="">${t('common.loadFailed')}: ${e.message || e}</option>`
    }
  }

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentSelect = radio.value
      updateRadioStyle()
      loadVersions(currentSelect)
    })
  })

  select.addEventListener('change', updateHint)

  confirmBtn.onclick = () => {
    const source = currentSelect
    const ver = select.value
    const action = confirmBtn.textContent
    close()
    doInstall(page, `${action} OpenClaw`, source, ver)
  }

  updateRadioStyle()
  loadVersions(currentSelect)
}

/**
 * 执行安装/升级/降级/切换操作（带进度弹窗）
 */
async function doInstall(page, title, source, version) {
  const modal = showUpgradeModal(title)
  modal.onClose(() => loadData(page))
  let unlistenLog, unlistenProgress, unlistenDone, unlistenError
  setUpgrading(true)

  const cleanup = () => {
    setUpgrading(false)
    unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.()
  }

  try {
    if (window.__TAURI_INTERNALS__) {
      const { listen } = await import('@tauri-apps/api/event')
      unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
      unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))

      unlistenDone = await listen('upgrade-done', (e) => {
        cleanup()
        modal.setDone(typeof e.payload === 'string' ? e.payload : t('about.operationDone'))
      })

      unlistenError = await listen('upgrade-error', async (e) => {
        cleanup()
        const errStr = String(e.payload || t('common.unknown'))
        modal.appendLog(errStr)
        const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
        const fullLog = modal.getLogText() + '\n' + errStr
        const diagnosis = diagnoseInstallError(fullLog)
        modal.setError(diagnosis.title)
        if (diagnosis.hint) modal.appendLog('')
        if (diagnosis.hint) modal.appendHtmlLog(`${statusIcon('info', 14)} ${diagnosis.hint}`)
        if (diagnosis.command) modal.appendHtmlLog(`${icon('clipboard', 14)} ${diagnosis.command}`)
        if (window.__openAIDrawerWithError) {
          window.__openAIDrawerWithError({ title: diagnosis.title, error: fullLog, scene: title, hint: diagnosis.hint })
        }
      })

      await api.upgradeOpenclaw(source, version)
      modal.appendLog(t('about.taskStarted'))
    } else {
      modal.appendLog(t('about.webModeNoLog'))
      const msg = await api.upgradeOpenclaw(source, version)
      modal.setDone(typeof msg === 'string' ? msg : (msg?.message || t('about.operationDone')))
      cleanup()
    }
  } catch (e) {
    cleanup()
    const errStr = String(e)
    modal.appendLog(errStr)
    const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
    const fullLog = modal.getLogText() + '\n' + errStr
    const diagnosis = diagnoseInstallError(fullLog)
    modal.setError(diagnosis.title)
  }
}

async function checkNewVersion(cards, panelVersion) {
  const el = () => cards.querySelector('#panel-update-meta')
  const btnSm = 'padding:2px 8px;font-size:var(--font-size-xs)'

  // 尝试获取 Tauri 二进制版本，检测「假更新」：
  // 前端通过热更新升级到 v0.13.0，但 Tauri 二进制仍是 v0.9.9
  let binaryVersion = panelVersion
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    binaryVersion = await getVersion()
  } catch {}

  // 前端版本 > 二进制版本 = 热更新导致版本不一致
  const isFakeUpdate = binaryVersion !== panelVersion && compareVersions(panelVersion, binaryVersion) > 0

  try {
    const info = await api.checkPanelUpdate()
    const meta = el()
    if (!meta) return

    const latest = info?.latest || ''
    // 用二进制版本（真实应用版本）做比较，避免假更新导致误判为「已是最新」
    const effectiveVersion = isFakeUpdate ? binaryVersion : panelVersion

    if (isFakeUpdate) {
      meta.innerHTML = `
        <span style="color:var(--warning)">⚠️ ${t('about.versionMismatch', { frontend: panelVersion, binary: binaryVersion })}</span>
        <span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('about.hotUpdateDeprecated')}</span>
      `
    } else if (latest && latest !== effectiveVersion && compareVersions(latest, effectiveVersion) > 0) {
      meta.innerHTML = `
        <span style="color:var(--accent)">${t('about.newVersionAvailable', { version: latest })}</span>
      `
    } else {
      meta.innerHTML = `<span style="color:var(--success)">${t('about.upToDate')}</span>`
    }
  } catch (err) {
    const meta = el()
    if (!meta) return
    if (isFakeUpdate) {
      meta.innerHTML = `<span style="color:var(--warning)">⚠️ ${t('about.versionMismatch', { frontend: panelVersion, binary: binaryVersion })}</span>`
    } else {
      meta.innerHTML = `<span style="color:var(--text-tertiary)">${t('about.checkUpdateFailed')}</span>`
    }
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

// 社区、项目列表、贡献指南、链接、公司介绍等板块已移除
