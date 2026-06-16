/**
 * 个人中心页面
 * 展示用户信息、退出登录、重置激活（调试用）
 */
import { getUserInfo, getUserQuota, getStoredUser, logout, navigateTo } from '../lib/user-api.js'
import { icon, statusIcon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'
import { toast } from '../components/toast.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('sidebar.profile')}</h1>
      <p class="page-desc">${t('profile.desc')}</p>
    </div>
    <div class="profile-body" id="profile-body">
      <div class="profile-loading">
        ${icon('refresh-cw', 20)}
        <span>${t('common.loading')}</span>
      </div>
    </div>
  `

  loadProfile(page)
  return page
}

async function loadProfile(page) {
  const body = page.querySelector('#profile-body')

  try {
    const [dataResult, quotaResult] = await Promise.allSettled([
      getUserInfo(),
      getUserQuota(),
    ])
    if (dataResult.status === 'rejected' && !getStoredUser()) {
      throw dataResult.reason
    }
    if (dataResult.status === 'rejected') {
      console.warn('[profile] user info load skipped:', dataResult.reason?.message)
    }
    if (quotaResult.status === 'rejected') {
      console.warn('[profile] quota load skipped:', quotaResult.reason?.message)
    }
    const data = dataResult.status === 'fulfilled'
      ? dataResult.value
      : { user: getStoredUser(), amount: 0, tokenInfo: {} }
    const yyapiQuota = quotaResult.status === 'fulfilled' ? quotaResult.value : null
    const user = data.user || getStoredUser()
    const amount = data.amount || 0
    const remainingTokens = data.tokenInfo?.remaining_tokens ?? amount
    const yyapiRemaining = yyapiQuota?.quota ?? null
    const yyapiUsed = yyapiQuota?.used_quota ?? null

    body.innerHTML = `
      <!-- 用户头像/基本信息卡片 -->
      <div class="card profile-card">
        <div class="card-body" style="padding:24px">
          <div class="profile-avatar">
            <span style="font-size:32px;line-height:1">🦞</span>
          </div>
          <div class="profile-name">${escapeHtml(user?.username || '—')}</div>
          <div class="profile-status">
            <span class="profile-status-dot"></span>
            ${t('profile.active')}
          </div>
        </div>
      </div>

      <!-- 用户详情 -->
      <div class="card profile-detail-card">
        <div class="card-header">
          <span class="card-header-title">${t('profile.accountInfo')}</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="profile-detail-row">
            <span class="profile-detail-label">${t('profile.userId')}</span>
            <span class="profile-detail-value">${escapeHtml(String(user?.id ?? '—'))}</span>
          </div>
          <div class="profile-detail-row">
            <span class="profile-detail-label">${t('auth.username')}</span>
            <span class="profile-detail-value">${escapeHtml(user?.username || '—')}</span>
          </div>
          <div class="profile-detail-row">
            <span class="profile-detail-label">${t('auth.phone')}</span>
            <span class="profile-detail-value">${escapeHtml(user?.phone || '—')}</span>
          </div>
          <div class="profile-detail-row">
            <span class="profile-detail-label">${t('profile.registerTime')}</span>
            <span class="profile-detail-value">${user?.createdAt ? formatDate(user.createdAt) : '—'}</span>
          </div>
          <div class="profile-detail-row">
            <span class="profile-detail-label">${t('profile.status')}</span>
            <span class="profile-detail-value">${escapeHtml(user?.status || '—')}</span>
          </div>
        </div>
      </div>

      <!-- YYApi 额度 -->
      ${yyapiRemaining !== null ? `
      <div class="card profile-token-card">
        <div class="card-header">
          <span class="card-header-title">${t('profile.tokenInfo')}</span>
        </div>
        <div class="card-body" style="padding:16px">
          <div class="profile-token-grid">
            <div class="profile-token-item profile-token-remaining">
              <div class="profile-token-label">${t('auth.remainingTokens')}</div>
              <div class="profile-token-value">${yyapiRemaining}</div>
            </div>
            <div class="profile-token-item">
              <div class="profile-token-label">已用额度</div>
              <div class="profile-token-value">${yyapiUsed}</div>
            </div>
          </div>
        </div>
      </div>` : ''}

      <!-- 操作按钮 -->
      <div class="profile-actions">
        <button class="btn btn-secondary" id="btn-logout">
          ${icon('log-out', 14)} ${t('profile.logout')}
        </button>
        <button class="btn btn-secondary btn-danger" id="btn-reset-activation">
          ${icon('refresh-cw', 14)} ${t('profile.resetActivation')}
        </button>
      </div>
    `

    bindProfileEvents(page)
  } catch (err) {
    body.innerHTML = `
      <div class="profile-error">
        ${statusIcon('err', 24)}
        <p>${t('common.loadFailed')}: ${escapeHtml(err.message)}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-secondary" id="btn-profile-retry">${t('common.retry')}</button>
          <button class="btn btn-secondary btn-danger" id="btn-profile-logout">
            ${icon('log-out', 14)} ${t('profile.logout')}
          </button>
        </div>
      </div>
    `
    body.querySelector('#btn-profile-retry')?.addEventListener('click', () => loadProfile(page))
    body.querySelector('#btn-profile-logout')?.addEventListener('click', async () => {
      await logout()
      navigateTo('login')
    })
  }
}

function bindProfileEvents(page) {
  // 退出登录
  page.querySelector('#btn-logout')?.addEventListener('click', async () => {
    await logout()
    navigateTo('login')
  })

  // 重置激活（清除 sessionStorage 中的激活码，跳转到激活页）
  page.querySelector('#btn-reset-activation')?.addEventListener('click', () => {
    sessionStorage.removeItem('superclaw_activation_code')
    sessionStorage.removeItem('superclaw_activation_amount')
    toast(t('profile.resetActivationDone'), 'info')
    navigateTo('activate')
  })
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
