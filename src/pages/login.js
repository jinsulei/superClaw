import { navigate } from '../router.js'
import { loginAuth } from '../lib/auth-session.js'

function field(label, name, type = 'text', placeholder = '') {
  return `
    <label class="auth-field">
      <span class="auth-label">${label}</span>
      <span class="auth-input-wrap">
        <span class="auth-input-icon">•</span>
        <input class="auth-input" name="${name}" type="${type}" placeholder="${placeholder}" autocomplete="${type === 'password' ? 'current-password' : 'username'}" />
      </span>
    </label>
  `
}

export function render() {
  const page = document.createElement('div')
  page.className = 'auth-page'
  page.innerHTML = `
    <div class="auth-container">
      <form class="auth-card" id="auth-login-form">
        <h1 class="auth-title">登录 SuperClaw</h1>
        <p class="auth-desc">当前版本已接入 auth-yyapi-kit。测试模式不会强制登录，正式模式需要登录和激活。</p>
        <div class="auth-error" id="auth-login-error" hidden></div>
        ${field('账号', 'username', 'text', '手机号 / 用户名 / 邮箱')}
        ${field('密码', 'password', 'password', '请输入密码')}
        <button class="auth-btn" type="submit">登录</button>
        <div class="auth-footer">
          没有账号？
          <a class="auth-link" href="#/register">创建测试账号</a>
        </div>
      </form>
    </div>
  `

  const form = page.querySelector('#auth-login-form')
  const errorEl = page.querySelector('#auth-login-error')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true
    const data = new FormData(form)
    const btn = form.querySelector('button[type="submit"]')
    btn.disabled = true
    try {
      const result = await loginAuth({
        username: data.get('username'),
        password: data.get('password'),
      })
      const status = result.status || {}
      navigate(status.allowAppAccess ? '/dashboard' : '/activate')
    } catch (error) {
      errorEl.textContent = error.message || '登录失败'
      errorEl.hidden = false
    } finally {
      btn.disabled = false
    }
  })
  return page
}
