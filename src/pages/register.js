/**
 * 注册页面 — 用户名/手机号/密码 + 激活码绑定
 * 注册成功后自动登录并跳转到领证页
 */
import { registerV2, setToken, setStoredUser, navigateToAuth } from '../lib/user-api.js'
import { icon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'

export async function render() {
  const activationCode = sessionStorage.getItem('superclaw_activation_code') || ''
  const activationAmount = sessionStorage.getItem('superclaw_activation_amount') || ''

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
        <h1 class="auth-title">${t('auth.registerTitle')}</h1>
        <p class="auth-desc">${t('auth.registerDesc')}</p>

        ${activationCode ? `
        <div class="auth-code-badge">
          ${icon('gift', 14)} ${t('auth.codeBound')}: <strong>${activationCode}</strong>
          <span class="auth-code-amount">+${activationAmount}</span>
        </div>` : `
        <div class="auth-warning-badge">
          ${icon('alert-triangle', 14)} ${t('auth.needActivateHint')}
          <a class="auth-link" id="link-to-activate" style="margin-left:8px">${t('auth.needToActivate')}</a>
        </div>`}

        <form id="form-register">
          <div class="auth-field">
            <label class="auth-label" for="reg-username">${t('auth.username')}</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icon('users', 16)}</span>
              <input type="text" id="reg-username" class="auth-input" placeholder="${t('auth.usernamePlaceholder')}" autocomplete="username" />
            </div>
          </div>

          <div class="auth-field">
            <label class="auth-label" for="reg-phone">${t('auth.phone')}</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icon('phone', 16)}</span>
              <input type="tel" id="reg-phone" class="auth-input" placeholder="${t('auth.phonePlaceholder')}" autocomplete="tel" />
            </div>
          </div>

          <div class="auth-field">
            <label class="auth-label" for="reg-password">${t('auth.password')}</label>
            <div class="auth-input-wrap has-toggle">
              <span class="auth-input-icon">${icon('lock', 16)}</span>
              <input type="password" id="reg-password" class="auth-input" placeholder="${t('auth.passwordPlaceholder')}" autocomplete="new-password" />
              <button type="button" class="auth-password-toggle" data-toggle-password="#reg-password" title="${t('gateway.show') || '显示'}">${icon('eye', 16)}</button>
            </div>
          </div>

          <div class="auth-field">
            <label class="auth-label" for="reg-confirm">${t('auth.confirmPassword')}</label>
            <div class="auth-input-wrap has-toggle">
              <span class="auth-input-icon">${icon('lock', 16)}</span>
              <input type="password" id="reg-confirm" class="auth-input" placeholder="${t('auth.confirmPasswordPlaceholder')}" autocomplete="new-password" />
              <button type="button" class="auth-password-toggle" data-toggle-password="#reg-confirm" title="${t('gateway.show') || '显示'}">${icon('eye', 16)}</button>
            </div>
          </div>

          <div id="register-error" class="auth-error" style="display:none"></div>
          <button type="submit" class="auth-btn" id="btn-register">
            <span id="btn-register-text">${t('auth.registerBtn')}</span>
          </button>
        </form>

        <div class="auth-footer">
          <span>${t('auth.needLoginHint')}</span>
          <a class="auth-link" id="link-to-login">${t('auth.goToLogin')}</a>
        </div>
      </div>
    </div>
  `

  // 自动回填已保存的用户名和密码
  const savedUsername = localStorage.getItem('superclaw_yyapi_username')
  const savedPassword = localStorage.getItem('superclaw_yyapi_password')
  if (savedUsername) {
    const usernameInput = page.querySelector('#reg-username')
    if (usernameInput) usernameInput.value = savedUsername
  }
  if (savedPassword) {
    const passwordInput = page.querySelector('#reg-password')
    const confirmInput = page.querySelector('#reg-confirm')
    if (passwordInput) passwordInput.value = savedPassword
    if (confirmInput) confirmInput.value = savedPassword
  }

  bindRegisterEvents(page)
  return page
}

function bindRegisterEvents(page) {
  const form = page.querySelector('#form-register')
  const errorEl = page.querySelector('#register-error')
  const btn = page.querySelector('#btn-register')
  const btnText = page.querySelector('#btn-register-text')

  // 底部链接（auth 页面间跳转不触发全量刷新）
  const linkLogin = page.querySelector('#link-to-login')
  if (linkLogin) {
    linkLogin.addEventListener('click', (e) => { e.preventDefault(); navigateToAuth('login') })
  }
  const linkActivate = page.querySelector('#link-to-activate')
  if (linkActivate) {
    linkActivate.addEventListener('click', (e) => { e.preventDefault(); navigateToAuth('activate') })
  }

  bindPasswordToggles(page)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    const username = page.querySelector('#reg-username').value.trim()
    const phone = page.querySelector('#reg-phone').value.trim()
    const password = page.querySelector('#reg-password').value
    const confirm = page.querySelector('#reg-confirm').value
    const activationCode = sessionStorage.getItem('superclaw_activation_code') || ''

    // 前端校验
    if (!username) { showError(errorEl, t('auth.usernameRequired')); return }
    if (!password) { showError(errorEl, t('auth.passwordRequired')); return }
    if (password.length < 6) { showError(errorEl, t('auth.passwordMinLength')); return }
    if (password !== confirm) { showError(errorEl, t('auth.passwordMismatch')); return }
    hideError(errorEl)

    btn.disabled = true
    btnText.textContent = t('auth.registering')
    btn.classList.add('btn-loading')

    try {
      const result = await registerV2({
        username,
        phone,
        password,
        confirmPassword: confirm,
        activationCode,
      })

      // 保存 token 和用户信息
      if (result.token) {
        setToken(result.token)
      }
      if (result.user) {
        setStoredUser(result.user)
      }

      // 保存用户名和密码，供 YYApi 控制台自动登录使用
      localStorage.setItem('superclaw_yyapi_username', username)
      localStorage.setItem('superclaw_yyapi_password', password)

      // 保存 v2 注册返回的 YYApi API Key（明文）
      const yyapiKey = result.new_api_key || result.api_key || result.apiKey || ''
      if (yyapiKey) {
        localStorage.setItem('superclaw_yyapi_key', yyapiKey)
      }
      if (result.new_api_user_id) {
        localStorage.setItem('superclaw_yyapi_user_id', String(result.new_api_user_id))
      }

      // 清理 sessionStorage 中的激活码
      sessionStorage.removeItem('superclaw_activation_code')
      sessionStorage.removeItem('superclaw_activation_amount')

      // 跳转到领证页面（auth 页面间跳转，不触发全量刷新）
      navigateToAuth('claim')
    } catch (err) {
      showError(errorEl, err.message || t('auth.registerFailed'))
      btn.disabled = false
      btnText.textContent = t('auth.registerBtn')
      btn.classList.remove('btn-loading')
    }
  })
}

function bindPasswordToggles(page) {
  page.querySelectorAll('[data-toggle-password]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = page.querySelector(btn.dataset.togglePassword)
      if (!input) return
      input.type = input.type === 'password' ? 'text' : 'password'
    })
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
