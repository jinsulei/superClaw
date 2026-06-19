export function render() {
  const targetHash = '#/h/recharge'

  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash
  }

  const root = document.createElement('div')
  root.className = 'recharge-redirect-page page'
  root.innerHTML = `
    <section class="recharge-redirect-card">
      <h2>正在打开充值与套餐...</h2>
      <p>如果页面没有自动跳转，请点击下面按钮。</p>
      <button type="button" id="go-hermes-recharge">前往充值与套餐</button>
    </section>
  `

  const button = root.querySelector('#go-hermes-recharge')
  if (button) {
    button.addEventListener('click', () => {
      window.location.hash = targetHash
    })
  }

  return root
}
