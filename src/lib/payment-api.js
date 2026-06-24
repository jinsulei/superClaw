const PAYMENT_NOT_CONFIGURED = 'PAYMENT_API_NOT_CONFIGURED'

async function readJson(resp) {
  try {
    return await resp.json()
  } catch {
    return {}
  }
}

function unwrapPaymentResponse(data = {}) {
  if (data.data !== undefined) return data.data
  const { ok, success, code, message, error, ...rest } = data
  return Object.keys(rest).length ? rest : data
}

async function callPaymentApi(action, payload = {}) {
  const resp = await fetch('/__api/payment_request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })
  const data = await readJson(resp)
  if (!resp.ok || data.ok === false || data.success === false) {
    const code = data.code || (resp.status === 503 ? PAYMENT_NOT_CONFIGURED : '')
    const message = data.message || data.error || code || `HTTP ${resp.status}`
    const err = new Error(message)
    err.code = code
    err.status = resp.status
    err.payload = data
    throw err
  }
  return unwrapPaymentResponse(data)
}

export async function getTopupInfo() {
  return callPaymentApi('topup-info')
}

export async function getUserQuota() {
  return callPaymentApi('quota')
}

export async function createPaymentOrder(amount, type) {
  return callPaymentApi('create-order', { amount, type })
}

export async function getPaymentOrderStatus(orderId) {
  return callPaymentApi('order-status', { orderId, _: Date.now() })
}

export { PAYMENT_NOT_CONFIGURED }
