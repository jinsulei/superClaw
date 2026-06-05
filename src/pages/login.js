/**
 * 登录页面 — 用户名/手机号 + 密码
 * 替换旧的安全页面密码验证
 */
import { login, setToken, setStoredUser, isLoggedIn, navigateTo, navigateToAuth } from '../lib/user-api.js'
import { icon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'auth-page'

  // 如果已经登录，直接跳仪表盘
  if (isLoggedIn()) {
    navigateTo('dashboard')
    page.innerHTML = '<div class="auth-container"><div class="auth-card"><p>' + t('common.loading') + '</p></div></div>'
    return page
  }

  page.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
          </svg>
        </div>
        <h1 class="auth-title">${t('auth.loginTitle')}</h1>
        <p class="auth-desc">${t('auth.loginDesc')}</p>

        <form id="form-login">
          <div class="auth-field">
            <label class="auth-label" for="login-username">${t('auth.loginUsernameLabel')}</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icon('users', 16)}</span>
              <input type="text" id="login-username" class="auth-input" placeholder="${t('auth.loginUsernamePlaceholder')}" autocomplete="username" autofocus />
            </div>
          </div>

          <div class="auth-field">
            <label class="auth-label" for="login-password">${t('auth.loginPasswordLabel')}</label>
            <div class="auth-input-wrap has-toggle">
              <span class="auth-input-icon">${icon('lock', 16)}</span>
              <input type="password" id="login-password" class="auth-input" placeholder="${t('auth.loginPasswordPlaceholder')}" autocomplete="current-password" />
              <button type="button" class="auth-password-toggle" data-toggle-password="#login-password" title="${t('gateway.show') || '显示'}">${icon('eye', 16)}</button>
            </div>
          </div>

          <div id="login-error" class="auth-error" style="display:none"></div>
          <button type="submit" class="auth-btn" id="btn-login">
            <span id="btn-login-text">${t('auth.loginBtn')}</span>
          </button>
        </form>

        <div class="auth-footer">
          <span>${t('auth.noAccount')}</span>
          <a class="auth-link" id="link-to-register">${t('auth.goToRegister')}</a>
        </div>
      </div>
    </div>
  `

  // 自动回填已保存的用户名和密码
  const savedUsername = localStorage.getItem('superclaw_yyapi_username')
  const savedPassword = localStorage.getItem('superclaw_yyapi_password')
  if (savedUsername) {
    const usernameInput = page.querySelector('#login-username')
    if (usernameInput) usernameInput.value = savedUsername
  }
  if (savedPassword) {
    const passwordInput = page.querySelector('#login-password')
    if (passwordInput) passwordInput.value = savedPassword
  }

  bindLoginEvents(page)
  return page
}

function bindLoginEvents(page) {
  try {
    const form = page.querySelector('#form-login')
    const errorEl = page.querySelector('#login-error')
    const btn = page.querySelector('#btn-login')
    const btnText = page.querySelector('#btn-login-text')

    if (!form || !errorEl || !btn || !btnText) {
      console.error('[login] 页面元素缺失', { form: !!form, errorEl: !!errorEl, btn: !!btn, btnText: !!btnText })
      return
    }

    // 底部 "还没有账号？去注册 →" 链接（auth 页面间跳转不触发全量刷新）
    const linkRegister = page.querySelector('#link-to-register')
    if (linkRegister) {
      linkRegister.addEventListener('click', (e) => {
        e.preventDefault()
        navigateToAuth('register')
      })
    }

    bindPasswordToggles(page)

    form.addEventListener('submit', async (e) => {
      e.preventDefault()

      const username = page.querySelector('#login-username').value.trim()
      const password = page.querySelector('#login-password').value

      if (!username || !password) {
        showError(errorEl, t('auth.loginFailed'))
        return
      }

      hideError(errorEl)
      btn.disabled = true
      btnText.textContent = t('auth.loginSubmitting')
      btn.classList.add('btn-loading')

      try {
        const result = await login({ username, password })
        console.log('[login] 登录成功，result:', result)

        // 保存 token 和用户信息
        if (result.token) {
          setToken(result.token)
          console.log('[login] token 已保存')
        } else {
          console.warn('[login] result 中没有 token', result)
        }
        if (result.user) {
          setStoredUser(result.user)
        }

        // 保存用户名和密码，供 YYApi 控制台自动登录使用
        localStorage.setItem('superclaw_yyapi_username', username)
        localStorage.setItem('superclaw_yyapi_password', password)

        // 保存额度信息
        if (result.tokenInfo?.remaining_tokens !== undefined) {
          localStorage.setItem('superclaw_remaining_tokens', String(result.tokenInfo.remaining_tokens))
        }

        // 登录成功，全量刷新触发 boot 流程（JWT 已存，会直接进 dashboard）
        console.log('[login] 准备跳转到 dashboard')
        navigateTo('dashboard')
        console.log('[login] navigateTo 已执行')

        // 通知 main.js 触发 YYApi 同步（boot 时用户尚未登录）
        window.dispatchEvent(new CustomEvent('superclaw:login'))
      } catch (err) {
        console.error('[login] 登录失败:', err)
        showError(errorEl, err.message || t('auth.loginError'))
        btn.disabled = false
        btnText.textContent = t('auth.loginBtn')
        btn.classList.remove('btn-loading')
      }
    })

    // 回车提交
    const pwInput = page.querySelector('#login-password')
    if (pwInput) {
      pwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') form.dispatchEvent(new Event('submit'))
      })
    }
  } catch (err) {
    console.error('[login] bindLoginEvents 异常:', err)
  }
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
