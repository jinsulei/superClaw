import { navigate } from '../router.js'
import { activateAuth, fetchAuthStatus, logoutAuth } from '../lib/auth-session.js'

export function render() {
  const page = document.createElement('div')
  page.className = 'auth-page'
  page.innerHTML = `
    <div class="auth-container">
      <form class="auth-card" id="auth-activate-form">
        <h1 class="auth-title">激活 SuperClaw</h1>
        <p class="auth-desc" id="auth-activate-desc">正式模式需要激活后进入主界面。测试阶段只校验入口和本地 session。</p>
        <div class="auth-error" id="auth-activate-error" hidden></div>
        <label class="auth-field">
          <span class="auth-label">激活码</span>
          <span class="auth-input-wrap"><span class="auth-input-icon">•</span><input class="auth-input" name="activationCode" placeholder="请输入激活码" /></span>
        </label>
        <button class="auth-btn" type="submit">激活并进入</button>
        <button class="auth-btn auth-btn-secondary" type="button" id="auth-activate-logout" style="margin-top:10px">退出登录</button>
      </form>
    </div>
  `

  const form = page.querySelector('#auth-activate-form')
  const desc = page.querySelector('#auth-activate-desc')
  const errorEl = page.querySelector('#auth-activate-error')

  fetchAuthStatus().then(status => {
    if (status.user?.name) desc.textContent = `当前用户：${status.user.name}。请输入激活码完成正式模式校验。`
  }).catch(() => {})

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.hidden = true
    const data = new FormData(form)
    const btn = form.querySelector('button[type="submit"]')
    btn.disabled = true
    try {
      await activateAuth({ activationCode: data.get('activationCode') })
      navigate('/dashboard')
    } catch (error) {
      errorEl.textContent = error.message || '激活失败'
      errorEl.hidden = false
    } finally {
      btn.disabled = false
    }
  })

  page.querySelector('#auth-activate-logout')?.addEventListener('click', async () => {
    await logoutAuth().catch(() => {})
    navigate('/login')
  })

  return page
}
