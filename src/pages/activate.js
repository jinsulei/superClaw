import { navigate } from '../router.js'
import { activateAuth, clearLocalAuthSession, fetchAuthStatus } from '../lib/auth-session.js'

export function render() {
  const page = document.createElement('div')
  page.className = 'auth-page'
  page.innerHTML = `
    <div class="auth-container">
      <form class="auth-card" id="auth-activate-form">
        <h1 class="auth-title">激活 SuperClaw</h1>
        <p class="auth-desc" id="auth-activate-desc">正式模式需要先激活，再注册或登录账号。</p>
        <div class="auth-error" id="auth-activate-error" hidden></div>
        <label class="auth-field">
          <span class="auth-label">激活码</span>
          <span class="auth-input-wrap"><span class="auth-input-icon">•</span><input class="auth-input" name="activationCode" placeholder="请输入激活码" /></span>
        </label>
        <button class="auth-btn" type="submit">激活并继续登录</button>
        <div class="auth-footer">
          激活后可继续
          <a class="auth-link" href="#/login">登录</a>
          <span class="auth-footer-separator">或</span>
          <a class="auth-link" href="#/register">注册</a>
        </div>
        <button class="auth-btn auth-btn-secondary" type="button" id="auth-activate-clear">清除本地状态</button>
      </form>
    </div>
  `

  const form = page.querySelector('#auth-activate-form')
  const desc = page.querySelector('#auth-activate-desc')
  const errorEl = page.querySelector('#auth-activate-error')

  fetchAuthStatus().then(status => {
    if (status.user?.name) desc.textContent = `当前用户：${status.user.name}。如果激活已失效，请重新输入激活码。`
  }).catch(() => {})

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true
      const data = new FormData(form)
      const btn = form.querySelector('button[type="submit"]')
      btn.disabled = true
    try {
      await activateAuth({ activationCode: data.get('activationCode') })
      desc.textContent = '激活成功，请注册或登录账号。'
      navigate('/login')
    } catch (error) {
      errorEl.textContent = error.message || '激活失败'
      errorEl.hidden = false
    } finally {
      btn.disabled = false
    }
  })

  page.querySelector('#auth-activate-clear')?.addEventListener('click', () => {
    clearLocalAuthSession()
    navigate('/activate')
  })

  return page
}
