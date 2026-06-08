/**
 * 充值页面
 * 对接好收米支付 + YYAPI V2 后端
 * 展示折扣金额 + 支付方式 + 二维码扫码支付
 */
import { getTopupInfo, createPaymentOrder, getUserQuota, getPaymentOrderStatus } from '../lib/user-api.js'
import { icon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'
import { toast } from '../components/toast.js'

let _pollTimer = null
let _amounts = []
let _discountMap = {}
let _payMethods = []
let _selectedAmount = null
let _selectedMethod = null
let _quotaData = null    // { quota, used_quota }
let _orderState = null  // { orderId, qrCode, payUrl, amount, quotaAmount, paymentType }
let _orderCreatedAt = null  // Date.now() 订单创建时间戳
let _orderExpired = false   // 倒计时是否已过期
let _tokenRatio = 500000
const ORDER_TTL = 30 * 60 * 1000  // 订单有效期 30 分钟

export async function render() {
  const page = document.createElement('div')
  page.className = 'page payment-page'

  // 加载状态骨架
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('sidebar.recharge')}</h1>
      <p class="page-desc">${t('payment.desc') || '选择充值金额，扫码支付即可到账'}</p>
    </div>
    <div class="card">
      <div class="card-body" style="padding:24px;text-align:center">
        <div class="skeleton" style="width:60%;height:20px;margin:12px auto"></div>
        <div class="skeleton" style="width:40%;height:14px;margin:12px auto"></div>
      </div>
    </div>
  `

  // 异步加载充值配置
  loadTopupConfig(page).catch(err => {
    console.error('[payment] 加载配置失败:', err)
    page.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${t('sidebar.recharge')}</h1>
      </div>
      <div class="card">
        <div class="card-body" style="padding:32px;text-align:center;color:var(--error)">
          <p>${t('payment.loadError') || '加载充值配置失败'}</p>
          <button class="btn btn-primary" style="margin-top:16px" onclick="location.reload()">${t('common.retry') || '重试'}</button>
        </div>
      </div>
    `
  })

  return page
}

async function loadTopupConfig(page) {
  const [info, quota] = await Promise.all([
    getTopupInfo(),
    getUserQuota().catch(() => null),
  ])
  _quotaData = quota

  // 解析折扣映射和金额列表
  _discountMap = info.discount || {}
  _tokenRatio = Number(info.tokenRatio || info.token_ratio || _tokenRatio) || 500000
  _amounts = Object.keys(_discountMap).map(Number).sort((a, b) => a - b)
  _payMethods = info.pay_methods || []
  _selectedAmount = _amounts[0] || null
  _selectedMethod = _payMethods[0]?.type || null

  // 渲染页面
  renderPaymentPage(page, quota)
  bindEvents(page)
}

function formatAmount(amount) {
  return amount.toFixed(2)
}

function calcPayAmount(amount) {
  const discount = _discountMap[amount] || 1
  return amount * discount
}

function calcBonus(amount) {
  const payAmount = calcPayAmount(amount)
  return Math.round((amount - payAmount) * 100) / 100
}

function renderPaymentPage(page, quota) {
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('sidebar.recharge')}</h1>
      <p class="page-desc">${t('payment.desc') || '选择充值金额，扫码支付即可到账'}</p>
    </div>

    <!-- 额度信息 -->
    ${quota ? `
    <div class="card">
      <div class="card-header">
        <span class="card-header-title">${t('profile.tokenInfo')}</span>
      </div>
      <div class="card-body" style="padding:16px">
        <div class="profile-token-grid">
          <div class="profile-token-item profile-token-remaining">
            <div class="profile-token-label">${t('auth.remainingTokens')}</div>
            <div class="profile-token-value">${quota.quota ?? '-'}</div>
          </div>
          <div class="profile-token-item">
            <div class="profile-token-label">已用额度</div>
            <div class="profile-token-value">${quota.used_quota ?? '-'}</div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- 金额选择 -->
    <div class="card">
      <div class="card-header">
        <span class="card-header-title">${t('payment.selectAmount') || '选择充值金额'}</span>
        <small style="color:var(--text-secondary);font-size:12px;font-weight:400;margin-left:8px">￥1 = ${_tokenRatio.toLocaleString()} Token</small>
      </div>
      <div class="card-body">
        <div class="pay-amount-grid">
          ${_amounts.map(amt => {
            const payAmt = calcPayAmount(amt)
            const bonus = calcBonus(amt)
            const selected = _selectedAmount === amt ? ' selected' : ''
            const hasBonus = bonus > 0
            return `<div class="pay-amount-card${selected}" data-amount="${amt}">
              <div class="pay-amount-value">${amt} <span class="pay-amount-unit">元</span></div>
              <div class="pay-amount-pay">实付 <strong>${formatAmount(payAmt)}</strong> 元</div>
              ${hasBonus ? `<div class="pay-amount-bonus">优惠 ${formatAmount(bonus)} 元</div>` : ''}
            </div>`
          }).join('')}
        </div>
      </div>
    </div>

    <!-- 支付方式 -->
    <div class="card">
      <div class="card-header">
        <span class="card-header-title">${t('payment.selectMethod') || '选择支付方式'}</span>
      </div>
      <div class="card-body">
        <div class="pay-method-list">
          ${_payMethods.map(m => {
            const selected = _selectedMethod === m.type ? ' selected' : ''
            return `<div class="pay-method-item${selected}" data-method="${m.type}">
              <span class="pay-method-icon" style="background:${m.color || '#666'}">
                ${m.type === 'wxpay' ? icon('chat', 18) : m.type === 'alipay' ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M6 12l3 3 6-6"/></svg>` : ''}
              </span>
              <span class="pay-method-name">${m.name}</span>
              ${selected ? '<span class="pay-method-check">✓</span>' : ''}
            </div>`
          }).join('')}
        </div>
      </div>
    </div>

    <!-- 确认支付 -->
    <div class="card">
      <div class="card-body pay-confirm-area">
        <div class="pay-confirm-info">
          ${_selectedAmount != null ? `
            <span class="pay-confirm-label">${t('payment.payAmount') || '支付金额'}</span>
            <span class="pay-confirm-amount">¥ ${formatAmount(calcPayAmount(_selectedAmount))}</span>
          ` : ''}
        </div>
        <button class="btn btn-primary btn-lg pay-confirm-btn" id="btn-pay-confirm">
          ${t('payment.confirmPay') || '确认支付'}
        </button>
      </div>
    </div>

  `
}

function bindEvents(page) {
  // 金额选择
  page.addEventListener('click', (e) => {
    const amtCard = e.target.closest('.pay-amount-card')
    if (amtCard) {
      const amt = Number(amtCard.dataset.amount)
      if (_selectedAmount !== amt) {
        _selectedAmount = amt
        page.querySelectorAll('.pay-amount-card').forEach(el => el.classList.remove('selected'))
        amtCard.classList.add('selected')
        updateConfirmArea(page)
      }
      return
    }

    // 支付方式选择
    const methodItem = e.target.closest('.pay-method-item')
    if (methodItem) {
      const method = methodItem.dataset.method
      if (_selectedMethod !== method) {
        _selectedMethod = method
        page.querySelectorAll('.pay-method-item').forEach(el => el.classList.remove('selected'))
        methodItem.classList.add('selected')
        updateCheckMark(page)
      }
      return
    }

    // 确认支付
    const confirmBtn = e.target.closest('#btn-pay-confirm')
    if (confirmBtn && !confirmBtn.disabled) {
      handleConfirmPay(page)
      return
    }

  })
}

function updateConfirmArea(page) {
  const area = page.querySelector('.pay-confirm-area')
  if (!area) return
  const infoEl = area.querySelector('.pay-confirm-info')
  const btnEl = area.querySelector('#btn-pay-confirm')
  if (_selectedAmount != null) {
    infoEl.innerHTML = `
      <span class="pay-confirm-label">${t('payment.payAmount') || '支付金额'}</span>
      <span class="pay-confirm-amount">¥ ${formatAmount(calcPayAmount(_selectedAmount))}</span>
    `
  }
  btnEl.disabled = false
  // 有未完成订单时显示"继续支付"
  const nowExpired = _orderCreatedAt && (Date.now() - _orderCreatedAt > ORDER_TTL)
  const hasPending = _orderState && !_orderExpired && !nowExpired
  btnEl.textContent = hasPending
    ? (t('payment.continuePay') || '继续支付')
    : (t('payment.confirmPay') || '确认支付')
}

function updateCheckMark(page) {
  page.querySelectorAll('.pay-method-item').forEach(el => {
    const check = el.querySelector('.pay-method-check')
    if (el.dataset.method === _selectedMethod) {
      if (!check) el.insertAdjacentHTML('beforeend', '<span class="pay-method-check">✓</span>')
    } else {
      if (check) check.remove()
    }
  })
}

async function handleConfirmPay(page) {
  const btn = page.querySelector('#btn-pay-confirm')
  if (!btn || btn.disabled) return

  try {
    if (!_selectedAmount) throw new Error(t('payment.noAmount') || '请选择充值金额')

    // 检查是否可继续未完成订单（金额和支付方式未变，且未过期）
    const nowExpired = _orderCreatedAt && (Date.now() - _orderCreatedAt > ORDER_TTL)
    const canResume = _orderState && !_orderExpired && !nowExpired &&
      _orderState.paymentType === _selectedMethod

    if (canResume) {
      // 复用已有订单，直接弹二维码
      showQRCode(page, _orderState)
      return
    }

    btn.disabled = true
    btn.innerHTML = '<span class="btn-spinner"></span> 处理中...'

    const result = await createPaymentOrder(_selectedAmount, _selectedMethod)

    // 保存订单状态
    _orderState = {
      orderId: result.orderId,
      qrCode: result.qrCode,
      payUrl: result.payUrl,
      amount: result.amount,
      quotaAmount: result.quotaAmount,
      paymentType: result.paymentType,
    }
    _orderCreatedAt = Date.now()
    _orderExpired = false

    // 显示二维码
    showQRCode(page, result)

  } catch (err) {
    toast(err.message || t('payment.createFailed') || '创建订单失败', 'error')
    if (btn) {
      btn.disabled = false
      btn.textContent = t('payment.continuePay') || '继续支付'
    }
  }
}

function showQRCode(page, result) {
  // 动态创建弹窗 overlay
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay pay-qrcode-overlay'
  overlay.id = 'pay-qrcode-overlay'
  overlay.innerHTML = `
    <div class="modal pay-qrcode-modal">
      <div class="pay-qrcode-header">
        <span class="pay-qrcode-title">${t('payment.scanToPay') || '请扫码支付'}</span>
      </div>
      <div class="pay-qrcode-img-wrap" id="pay-qrcode-wrap">
        <img id="pay-qrcode-img" class="pay-qrcode-img" alt="支付二维码" />
      </div>
      <div class="pay-qrcode-info">
        <div class="pay-qrcode-method" id="pay-qrcode-method"></div>
        <div class="pay-qrcode-order" id="pay-qrcode-order"></div>
        <div class="pay-qrcode-timer" id="pay-qrcode-timer"></div>
      </div>
      <div class="pay-qrcode-status" id="pay-qrcode-status" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" width="40" height="40"><polyline points="20 6 9 17 4 12"/></svg>
        <div class="pay-qrcode-status-text">${t('payment.paySuccess') || '支付成功！'}</div>
        <div class="pay-qrcode-status-desc" id="pay-qrcode-status-desc"></div>
      </div>
      <button class="btn pay-qrcode-close" id="btn-pay-close">${t('payment.close') || '关闭'}</button>
    </div>
  `
  document.body.appendChild(overlay)

  const img = overlay.querySelector('#pay-qrcode-img')
  const methodEl = overlay.querySelector('#pay-qrcode-method')
  const orderEl = overlay.querySelector('#pay-qrcode-order')
  const timerEl = overlay.querySelector('#pay-qrcode-timer')
  const statusEl = overlay.querySelector('#pay-qrcode-status')

  // 隐藏页面确认区
  const confirmCard = page.querySelector('.pay-confirm-area')?.closest('.card')
  if (confirmCard) confirmCard.style.display = 'none'

  // 设置二维码图片
  img.src = result.qrCode || ''
  img.onerror = () => {
    img.style.display = 'none'
    const wrap = overlay.querySelector('#pay-qrcode-wrap')
    if (wrap && result.payUrl) {
      wrap.innerHTML = `
        <div class="pay-qrcode-fallback">
          <p>${t('payment.qrLoadError') || '二维码加载失败'}</p>
          <a href="${result.payUrl}" target="_blank" rel="noopener" class="btn btn-primary">${t('payment.openPayUrl') || '打开支付链接'}</a>
        </div>
      `
    }
  }

  const methodName = _payMethods.find(m => m.type === _selectedMethod)?.name || _selectedMethod
  methodEl.textContent = `${t('payment.payVia') || '支付方式'}：${methodName}`
  orderEl.textContent = `${t('payment.orderNo') || '订单号'}：${result.orderId}`

  // 关闭按钮
  overlay.querySelector('#btn-pay-close').onclick = () => closeQRCode(page)
  // 点击遮罩背景也关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeQRCode(page)
  })

  // 倒计时 30 分钟
  let remaining = 1800
  timerEl.textContent = formatTimer(remaining)
  if (_pollTimer) clearInterval(_pollTimer)
  _pollTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      clearInterval(_pollTimer)
      _pollTimer = null
      _orderExpired = true
      timerEl.textContent = t('payment.expired') || '已过期'
      return
    }
    timerEl.textContent = formatTimer(remaining)
  }, 1000)

  // 隐藏状态区
  statusEl.style.display = 'none'

  // 开始轮询余额
  startPolling(page, overlay)
}

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

async function startPolling(page, overlay) {
  const statusEl = overlay.querySelector('#pay-qrcode-status')
  const timerEl = overlay.querySelector('#pay-qrcode-timer')
  const orderNo = _orderState?.orderId

  // 额度接口依赖 YYApi 用户同步。老用户未同步时会 400，所以只作为兜底。
  const initialQuota = await getUserQuota().catch(() => null)
  const initialBalance = initialQuota?.balance ?? initialQuota?.remaining_tokens ?? null
  let quotaPollingDisabled = initialBalance == null
  let orderStatusAvailable = true
  let pollAttempts = 0
  const maxAttempts = Math.ceil(ORDER_TTL / 3000)

  const pollInterval = setInterval(async () => {
    if (!_orderState || _orderState.orderId !== orderNo) {
      clearInterval(pollInterval)
      return
    }

    pollAttempts += 1
    if (pollAttempts > maxAttempts) {
      clearInterval(pollInterval)
      return
    }

    try {
      if (orderStatusAvailable) {
        try {
          const order = await getPaymentOrderStatus(orderNo)
          const status = order?.status || order?.data?.status
          if (status === 'completed' || status === 'paid' || status === 'success') {
            clearInterval(pollInterval)
            markPaymentSuccess(page, overlay, statusEl, timerEl)
            return
          }
        } catch (err) {
          if (/404|not found|Cannot GET/i.test(err?.message || '')) {
            orderStatusAvailable = false
          }
        }
      }

      if (!quotaPollingDisabled) {
        try {
          const quota = await getUserQuota()
          const currentBalance = quota?.balance ?? quota?.remaining_tokens ?? null
          if (initialBalance != null && currentBalance != null && currentBalance > initialBalance) {
            clearInterval(pollInterval)
            markPaymentSuccess(page, overlay, statusEl, timerEl)
          }
        } catch {
          quotaPollingDisabled = true
        }
      }
    } catch {
      // 忽略瞬时轮询错误，二维码倒计时负责过期控制。
    }
  }, 3000)

  // 保存轮询引用以便清理
  page._pollInterval = pollInterval
}

function markPaymentSuccess(page, overlay, statusEl, timerEl) {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }

  const successState = {
    amount: _orderState?.amount,
    quotaAmount: _orderState?.quotaAmount,
  }

  statusEl.style.display = ''
  timerEl.textContent = t('payment.paid') || '已支付'

  const descEl = overlay.querySelector('#pay-qrcode-status-desc')
  if (descEl) {
    descEl.textContent = `${t('payment.recharged') || '充值成功'}：${successState.amount} ${t('payment.yuan') || '元'}（${successState.quotaAmount?.toLocaleString() || ''} Token）`
  }

  toast(t('payment.paySuccess') || '支付成功！', 'success')
  getUserQuota().then(quota => { _quotaData = quota }).catch(() => {})
  setTimeout(() => {
    closeQRCode(page)
    resetPaymentState(page)
    showRechargeSuccessDialog(page, successState)
    loadTopupConfig(page).catch(err => console.error('[payment] 刷新充值页失败:', err))
  }, 1200)
}

function resetPaymentState(page) {
  _orderState = null
  _orderCreatedAt = null
  _orderExpired = false

  const btn = page.querySelector('#btn-pay-confirm')
  if (btn) {
    btn.disabled = false
    btn.textContent = t('payment.confirmPay') || '确认支付'
  }
}

function showRechargeSuccessDialog(page, state) {
  const existing = document.getElementById('pay-success-overlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay pay-success-overlay'
  overlay.id = 'pay-success-overlay'
  overlay.innerHTML = `
    <div class="modal pay-qrcode-modal">
      <div class="pay-qrcode-status" style="display:flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" width="48" height="48"><polyline points="20 6 9 17 4 12"/></svg>
        <div class="pay-qrcode-status-text">${t('payment.paySuccess') || '充值成功'}</div>
        <div class="pay-qrcode-status-desc">
          ${state.amount ?? '-'} ${t('payment.yuan') || '元'} · ${state.quotaAmount?.toLocaleString() || ''} Token
        </div>
      </div>
      <button class="btn btn-primary pay-qrcode-close" id="btn-pay-success-close">${t('common.confirm') || '确定'}</button>
    </div>
  `
  document.body.appendChild(overlay)
  overlay.querySelector('#btn-pay-success-close')?.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })
}

function closeQRCode(page) {
  const overlay = document.getElementById('pay-qrcode-overlay')
  if (overlay) overlay.remove()

  const confirmCard = page.querySelector('.pay-confirm-area')?.closest('.card')
  if (confirmCard) confirmCard.style.display = ''

  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  if (page._pollInterval) { clearInterval(page._pollInterval); page._pollInterval = null }
}

export function cleanup() {
  if (_pollTimer) {
    clearInterval(_pollTimer)
    _pollTimer = null
  }
}
