import { navigate } from '../router.js'
import { loginAuth } from '../lib/auth-session.js'

export function render() {
  const page = document.createElement('div')
  page.className = 'auth-page'
  page.innerHTML = `
    <div class="auth-container">
      <form class="auth-card" id="auth-register-form">
        <h1 class="auth-title">创建测试账号</h1>
        <p class="auth-desc">Phase 2 只接入最小注册入口。真实注册、套餐和 yyapi 用户创建会在后续阶段接回。</p>
        <div class="auth-error" id="auth-register-error" hidden></div>
        <label class="auth-field">
          <span class="auth-label">账号</span>
          <span class="auth-input-wrap"><span class="auth-input-icon">•</span><input class="auth-input" name="username" placeholder="手机号 / 用户名 / 邮箱" /></span>
        </label>
        <label class="auth-field">
          <span class="auth-label">密码</span>
          <span class="auth-input-wrap"><span class="auth-input-icon">•</span><input class="auth-input" name="password" type="password" placeholder="设置测试密码" /></span>
        </label>
        <button class="auth-btn" type="submit">创建并登录</button>
        <div class="auth-footer">
          已有账号？
          <a class="auth-link" href="#/login">返回登录</a>
        </div>
      </form>
    </div>
  `

  const form = page.querySelector('#auth-register-form')
  const errorEl = page.querySelector('#auth-register-error')
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
        mode: 'register',
      })
      const status = result.status || {}
      navigate(status.allowAppAccess ? '/dashboard' : '/activate')
    } catch (error) {
      errorEl.textContent = error.message || '注册失败'
      errorEl.hidden = false
    } finally {
      btn.disabled = false
    }
  })
  return page
}
