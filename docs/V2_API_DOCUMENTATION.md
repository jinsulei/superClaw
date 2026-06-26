# V2 支付 API 文档

Base URL: `<PAYMENT_BACKEND_URL>/api/v2/payment`

---

## 1. 获取充值配置（折扣 + 支付方式）

获取当前充值折扣档位和可用的支付方式列表。

**请求**
```
GET /api/v2/payment/topup-info
```

**响应示例**
```json
{
    "data": {
        "discount": {
            "10": 1,
            "20": 0.99,
            "30": 0.98,
            "50": 0.97,
            "100": 0.96,
            "200": 0.95,
            "300": 0.94,
            "500": 0.93
        },
        "pay_methods": [
            {
                "color": "rgba(var(--semi-green-5), 1)",
                "name": "微信",
                "type": "wxpay"
            },
            {
                "color": "black",
                "min_topup": "0.01",
                "name": "自定义1",
                "type": "custom1"
            }
        ]
    },
    "message": "",
    "success": true
}
```

| 字段 | 说明 |
|------|------|
| `data.discount` | 充值金额对应的折扣，key 为金额（元），value 为折扣系数 |
| `data.pay_methods[].type` | 支付方式标识，用于下单时传入 `type` 参数 |
| `data.pay_methods[].name` | 支付方式展示名 |
| `data.pay_methods[].color` | 前端展示颜色 |

---

## 2. 创建支付订单

调用好收米 API 生成支付二维码，用户扫码付款。

**请求**
```
POST /api/v2/payment/create-order
Content-Type: application/json
Authorization: Bearer {jwt_token}
```

**请求体**
```json
{
    "amount": 100
}
```

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `amount` | 是 | number | 充值金额，单位元，范围 1-50000 |

**响应（成功）**
```json
{
    "success": true,
    "orderId": "hs_1747182000000_a1b2c3def",
    "amount": 100,
    "quotaAmount": 10000000,
    "paymentType": "alipay",
    "qrCode": "data:image/png;base64,iVBORw0KGgo...",
    "payUrl": null
}
```

| 字段 | 说明 |
|------|------|
| `orderId` | 商户订单号，格式 `hs_{timestamp}_{random}` |
| `amount` | 充值金额（元） |
| `quotaAmount` | 获得的虾米数（1元 = 100000虾米） |
| `paymentType` | 支付方式，固定 `alipay` |
| `qrCode` | 二维码图片 base64 data URL，直接赋值给 `<img src>` 展示 |
| `payUrl` | 支付跳转链接（备用），二维码无法加载时可跳转 |

**响应（失败）**
```json
{
    "error": "下单失败原因"
}
```

---

## 3. 支付回调通知（好收米 → 服务器）

好收米支付平台以 GET 请求通知支付结果。

```
GET /api/v2/payment/haoshoumi/callback?pid=xxx&trade_no=xxx&out_trade_no=xxx&type=alipay&name=xxx&money=1.00&trade_status=TRADE_SUCCESS&sign=xxx&sign_type=MD5
```

| 参数 | 说明 |
|------|------|
| `pid` | 商户ID |
| `trade_no` | 好收米订单号 |
| `out_trade_no` | 商户订单号（即 `orderId`） |
| `type` | 支付方式 |
| `name` | 商品名称 |
| `money` | 商品金额 |
| `trade_status` | 固定 `TRADE_SUCCESS` 表示支付成功 |
| `sign` | MD5 签名 |
| `sign_type` | 固定 `MD5` |

**响应**：返回字符串 `success`。

---

## 4. 签名算法（MD5）

好收米使用 MD5 签名，规则如下：

1. 将所有参数按参数名 ASCII 码从小到大排序（a-z）
2. 剔除 `sign`、`sign_type` 和空值参数
3. 拼接为 `key=value&key=value` 格式
4. 拼接商户密钥：`sign = md5(拼接字符串 + 密钥)`，结果小写

**示例**：
```
参数: { pid: "1001", money: "1.00", type: "alipay" }
排序后拼接: "money=1.00&pid=1001&type=alipay"
sign = md5("money=1.00&pid=1001&type=alipay" + "your_key")
```

---

## 错误码

| HTTP状态码 | 说明 |
|-----------|------|
| 400 | 参数错误（金额无效、未绑定令牌等） |
| 401 | 未授权（Token 缺失或无效） |
| 500 | 服务端错误（下单失败、上游接口异常等） |
