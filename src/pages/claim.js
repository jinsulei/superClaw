/**
 * 领证页面 — 展示初始额度和用户信息
 * 注册成功后自动跳转至此页
 */
import { getUserInfo, getUserInfoV2, getUserQuota, isLoggedIn, getStoredUser, navigateTo, navigateToAuth } from '../lib/user-api.js'
import { icon, statusIcon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'

const DEFAULT_REGISTER_QUOTA = 2000000

export async function render() {
  const page = document.createElement('div')
  page.className = 'auth-page'

  page.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-loading" id="claim-loading">
          ${icon('refresh-cw', 24)}
          <p>${t('common.loading')}</p>
        </div>
        <div id="claim-content" style="display:none"></div>
      </div>
    </div>
  `

  loadClaimData(page)
  return page
}

async function loadClaimData(page) {
  const loadingEl = page.querySelector('#claim-loading')
  const contentEl = page.querySelector('#claim-content')

  try {
    if (!isLoggedIn()) {
      // 未登录，跳转到激活页（auth 页面间跳转）
      navigateToAuth('activate')
      return
    }

    const data = await loadClaimUserInfo()
    const user = data.user || getStoredUser()
    const amount = resolveClaimAmount(data)
    const remainingTokens = resolveRemainingTokens(data, amount)

    // 读取注册时保存的 YYApi API Key
    const yyapiKey = localStorage.getItem('superclaw_yyapi_key') || ''

    loadingEl.style.display = 'none'
    contentEl.style.display = 'block'

    contentEl.innerHTML = `
      <div class="auth-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
        </svg>
      </div>
      <h1 class="auth-title" style="color:var(--success)">${t('auth.claimSuccess', { amount })}</h1>
      <p class="auth-desc">${t('auth.claimInfo')}</p>

      <div class="claim-cards">
        <div class="claim-card claim-card-amount">
          <div class="claim-card-label">${t('auth.totalAmount')}</div>
          <div class="claim-card-value">${amount}</div>
        </div>
        <div class="claim-card claim-card-remaining">
          <div class="claim-card-label">${t('auth.remainingTokens')}</div>
          <div class="claim-card-value">${remainingTokens}</div>
        </div>
      </div>

      ${user ? `
      <div class="claim-user-info">
        <div class="claim-user-row">
          <span class="claim-user-label">${t('auth.username')}</span>
          <span class="claim-user-value">${escapeHtml(user.username || '')}</span>
        </div>
        <div class="claim-user-row">
          <span class="claim-user-label">${t('auth.phone')}</span>
          <span class="claim-user-value">${escapeHtml(user.phone || '')}</span>
        </div>
      </div>` : ''}

      ${yyapiKey ? `
      <div class="claim-yyapi-section" style="margin-top:20px;background:var(--bg-tertiary);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border-primary)">
        <div style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:8px">YYApi ${t('profile.apiKey')}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <code style="flex:1;font-size:11px;background:var(--bg-primary);padding:8px 12px;border-radius:var(--radius-sm);word-break:break-all;color:var(--text-secondary);user-select:all">${escapeHtml(yyapiKey)}</code>
          <button class="btn btn-sm btn-primary" id="btn-copy-yyapi-key" style="flex-shrink:0">${t('common.copy')}</button>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">${t('profile.yyapiAutoKeyHint')}</div>
      </div>` : ''}

      <div style="margin-top:24px;display:flex;flex-direction:column;gap:10px">
        <button class="auth-btn" id="btn-go-dashboard">${t('auth.goToDashboard')}</button>
      </div>
    `

    // 绑定 API Key 复制按钮
    const copyBtn = contentEl.querySelector('#btn-copy-yyapi-key')
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(yyapiKey)
          copyBtn.textContent = t('common.copied')
          setTimeout(() => { copyBtn.textContent = t('common.copy') }, 2000)
        } catch {
          // fallback
          const ta = document.createElement('textarea')
          ta.value = yyapiKey; ta.style.position = 'fixed'; ta.style.opacity = '0'
          document.body.appendChild(ta); ta.select(); document.execCommand('copy')
          document.body.removeChild(ta)
          copyBtn.textContent = t('common.copied')
          setTimeout(() => { copyBtn.textContent = t('common.copy') }, 2000)
        }
      })
    }

    // 绑定事件
    contentEl.querySelector('#btn-go-dashboard').addEventListener('click', () => {
      navigateTo('dashboard')
    })

  } catch (err) {
    loadingEl.style.display = 'none'
    contentEl.style.display = 'block'
    contentEl.innerHTML = `
      <div style="text-align:center;padding:40px 0">
        <div style="color:var(--error);margin-bottom:12px">${statusIcon('err', 32)}</div>
        <p style="color:var(--error)">${t('common.loadFailed')}: ${escapeHtml(err.message)}</p>
        <button class="auth-btn" id="btn-claim-retry" style="margin-top:16px">${t('common.retry')}</button>
      </div>
    `
    contentEl.querySelector('#btn-claim-retry').addEventListener('click', () => {
      loadClaimData(page)
    })
  }
}

async function loadClaimUserInfo() {
  const [v2Info, v2Quota] = await Promise.all([
    getUserInfoV2().catch(() => null),
    getUserQuota().catch(() => null),
  ])

  if (v2Info || v2Quota) {
    return {
      ...(v2Info || {}),
      amount: pickPositiveNumber(
        v2Quota?.quota,
        v2Quota?.balance,
        v2Quota?.remaining_tokens,
        v2Info?.amount,
        v2Info?.balance,
        v2Info?.tokenInfo?.remaining_tokens
      ),
      tokenInfo: {
        ...(v2Info?.tokenInfo || {}),
        remaining_tokens: pickPositiveNumber(
          v2Quota?.quota,
          v2Quota?.balance,
          v2Quota?.remaining_tokens,
          v2Info?.tokenInfo?.remaining_tokens,
          v2Info?.amount,
          v2Info?.balance
        ),
      },
    }
  }

  return getUserInfo()
}

function resolveClaimAmount(data) {
  return pickPositiveNumber(data?.amount, data?.balance, data?.tokenInfo?.remaining_tokens) || DEFAULT_REGISTER_QUOTA
}

function resolveRemainingTokens(data, amount) {
  return pickPositiveNumber(data?.tokenInfo?.remaining_tokens, data?.balance, data?.amount) || amount || DEFAULT_REGISTER_QUOTA
}

function pickPositiveNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value)
    if (Number.isFinite(numberValue) && numberValue > 0) return numberValue
  }
  return 0
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
