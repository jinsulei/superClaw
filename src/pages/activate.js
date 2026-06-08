/**
 * 激活页面 — 永久一次激活
 * 输入 32 位激活码，验证后进入注册
 */
import { activateCode, navigateTo, navigateToAuth } from '../lib/user-api.js'
import { icon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'
import { prepareActivationBinding } from '../lib/license-binding.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'auth-page'

  page.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
          </svg>
        </div>
        <h1 class="auth-title">SuperClaw</h1>
        <p class="auth-desc">${t('auth.activateDesc')}</p>

        <div class="auth-status" id="activate-status" style="display:none"></div>

        <form id="form-activate">
          <div class="auth-field">
            <label class="auth-label" for="activate-code">${t('auth.activationCode')}</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icon('key', 16)}</span>
              <input type="text" id="activate-code" class="auth-input" placeholder="${t('auth.activationCodePlaceholder')}" maxlength="32" autocomplete="off" spellcheck="false" />
            </div>
          </div>
          <div id="activate-error" class="auth-error" style="display:none"></div>
          <button type="submit" class="auth-btn" id="btn-activate">
            <span id="btn-activate-text">${t('auth.activateBtn')}</span>
          </button>
        </form>
      </div>
    </div>
  `

  bindActivateEvents(page)
  return page
}

function bindActivateEvents(page) {
  const form = page.querySelector('#form-activate')
  const codeInput = page.querySelector('#activate-code')
  const errorEl = page.querySelector('#activate-error')
  const btn = page.querySelector('#btn-activate')
  const btnText = page.querySelector('#btn-activate-text')
  const statusEl = page.querySelector('#activate-status')

  // 自动格式化：大写激活码
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const code = codeInput.value.trim()

    // 校验
    if (!code) {
      showError(errorEl, t('auth.codeRequired'))
      return
    }
    if (code.length < 10) {
      showError(errorEl, t('auth.codeLengthError'))
      return
    }

    hideError(errorEl)
    btn.disabled = true
    btnText.textContent = t('auth.activating')
    btn.classList.add('btn-loading')

    try {
      const binding = await prepareActivationBinding()
      if (binding.blockingError) {
        throw new Error(binding.blockingError)
      }
      const result = await activateCode(code, binding.options)
      // 保存激活码到 sessionStorage，供注册页面使用
      sessionStorage.setItem('superclaw_activation_code', code)
      sessionStorage.setItem('superclaw_activation_amount', String(result.amount || 0))
      if (binding.context) {
        sessionStorage.setItem('superclaw_activation_usb_context', JSON.stringify(binding.context))
      }

      // 显示成功状态
      statusEl.style.display = 'block'
      statusEl.className = 'auth-status auth-status-success'
      statusEl.innerHTML = `<span class="auth-status-icon">${icon('check-circle', 18)}</span>
        <div>
          <div class="auth-status-title">${t('auth.activateSuccess')}</div>
          <div class="auth-status-desc">${t('auth.activateSuccessDesc')}</div>
        </div>`

      // 延迟跳转到注册（auth 页面间跳转，不触发全量刷新）
      setTimeout(() => {
        navigateToAuth('register')
      }, 1200)
    } catch (err) {
      showError(errorEl, err.message || t('auth.activateFailed'))
      btn.disabled = false
      btnText.textContent = t('auth.activateBtn')
      btn.classList.remove('btn-loading')
    }
  })
}

function showError(el, msg) {
  el.textContent = msg
  el.style.display = 'block'
}

function hideError(el) {
  el.textContent = ''
  el.style.display = 'none'
}
