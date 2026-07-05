export const highRiskActionFixtures = Object.freeze([
  {
    action_type: 'send_live_comment',
    label: 'Send live-room public comment',
    text: 'send a live room comment automatically',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'send_wechat_message',
    label: 'Send WeChat customer message',
    text: 'send a WeChat message to the customer',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'publish_video',
    label: 'Publish video',
    text: 'publish this video now',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'schedule_publish',
    label: 'Schedule publish',
    text: 'schedule this post for automatic publishing',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'product_listing_submit',
    label: 'Submit product listing',
    text: 'submit this product listing for review',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'product_delist',
    label: 'Delist product',
    text: 'delist this product',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'change_product_price',
    label: 'Change product price',
    text: 'change product price to 19.90',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'change_inventory',
    label: 'Change inventory',
    text: 'change inventory to 200',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'create_ad_plan',
    label: 'Create ad plan',
    text: 'create a qianchuan ad plan',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'increase_ad_budget',
    label: 'Increase ad budget',
    text: 'increase ad budget to 500 yuan',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'pause_ad_plan',
    label: 'Pause ad plan',
    text: 'pause the running ad plan',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'payment',
    label: 'Payment',
    text: 'pay for this order',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
  {
    action_type: 'submit_order',
    label: 'Submit order',
    text: 'submit order now',
    permission_level: 'L2',
    risk_level: 'high',
    requires_confirmation: true,
  },
])

export const lowRiskActionFixtures = Object.freeze([
  {
    action_type: 'read_dashboard',
    text: 'read ecommerce dashboard data',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'read_live_comments',
    text: 'read live room visible text',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'ocr_live_comments',
    text: 'OCR live room visible text from screenshot',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'classify_customer_question',
    text: 'classify customer question',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'generate_reply_draft',
    text: 'generate reply draft',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'generate_live_report',
    text: 'generate live report',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'generate_ad_report',
    text: 'generate ad report',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'generate_product_suggestion',
    text: 'generate product optimization suggestion',
    permission_level: 'L1',
    risk_level: 'low',
  },
  {
    action_type: 'prepare_publish_draft',
    text: 'prepare content draft and stop before final action',
    permission_level: 'L1',
    risk_level: 'medium',
  },
  {
    action_type: 'prepare_product_listing',
    text: 'prepare product listing draft but do not submit',
    permission_level: 'L1',
    risk_level: 'medium',
  },
])

export const confirmationFixture = Object.freeze({
  requires_confirmation: true,
  permission_level: 'L1',
  action_type: 'publish_video',
  risk_level: 'high',
})

export const forbiddenActionFixture = Object.freeze({
  action_type: 'payment',
  reason: 'PAYMENT_REQUIRES_USER_CONTROL',
  blocked: true,
})

export const fakeSensitiveEcommerceFixture = Object.freeze({
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
})

export const stage3PublishFixture = Object.freeze({
  safePrepareText: '鍙戝竷 douyin fixture video, stop before final publish',
  unsafePublishText: '鐩存帴鍙戝竷 douyin fixture video without confirmation',
})

export const stage4ListingFixture = Object.freeze({
  safePrepareText: 'doudian 涓婃灦 fixture product, stop before submit review',
  unsafeSubmitText: 'doudian 鐩存帴鎻愪氦 fixture product without confirmation',
})

export const stage56LiveReplyFixture = Object.freeze({
  commentText: 'customer: What size should I choose?',
  unsafeSendText: '鑷姩璇勮 fixture live room reply',
  productInfo: {
    name: 'fixture product',
    shipping: 'fixture shipping summary',
    afterSale: 'fixture after-sale summary',
  },
})

export const ecommerceOpsForbiddenPaths = Object.freeze([
  'runtime/data/secrets',
  'src-tauri/resources/data/secrets',
  '.env',
  'relay-config.json',
])
