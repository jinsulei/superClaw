export const wechatOcrTextFixture = Object.freeze([
  'Customer: Hello, is size M available?',
  'Customer phone: 13800138000',
  'Address: 88 Fixture Road, Hangzhou',
  'Order: WX202607060001',
  'WeChat: fixture_wechat_id',
].join('\n'))

export const wechatCustomerMessageFixture = Object.freeze({
  task_id: 'wechat-customer-task-fixture-001',
  source: 'ocr',
  channel: 'wechat',
  customer_id: 'customer-fixture-001',
  customer_name: 'Fixture Customer',
  ocr_text: wechatOcrTextFixture,
  history: [
    {
      role: 'customer',
      text: 'Is size M available?',
      created_at: '2026-07-06T08:00:00.000Z',
    },
  ],
  customer_state: {
    stage: 'pre_sale',
    last_order_id: 'WX202607060001',
  },
})

export const allowedWechatActionFixtures = Object.freeze([
  {
    action_type: 'read_wechat_visible_text',
    permission_level: 'L1',
    risk_level: 'low',
    text: 'read visible WeChat chat text',
  },
  {
    action_type: 'ocr_wechat_screenshot',
    permission_level: 'L1',
    risk_level: 'low',
    text: 'OCR WeChat screenshot',
  },
  {
    action_type: 'classify_customer_question',
    permission_level: 'L1',
    risk_level: 'low',
    text: 'classify customer question',
  },
  {
    action_type: 'generate_reply_draft',
    permission_level: 'L1',
    risk_level: 'low',
    text: 'generate WeChat reply draft',
  },
  {
    action_type: 'tag_customer',
    permission_level: 'L1',
    risk_level: 'low',
    text: 'tag customer intent',
  },
  {
    action_type: 'suggest_follow_up',
    permission_level: 'L1',
    risk_level: 'low',
    text: 'suggest follow up',
  },
])

export const highRiskWechatActionFixtures = Object.freeze([
  {
    action_type: 'send_wechat_message',
    permission_level: 'L1',
    risk_level: 'high',
    text: 'send WeChat message to customer automatically',
    requires_confirmation: true,
  },
  {
    action_type: 'send_private_message',
    permission_level: 'L2',
    risk_level: 'high',
    text: 'send private message to customer',
    requires_confirmation: true,
  },
])

export const replyDraftFixture = Object.freeze({
  draft_id: 'wechat-draft-fixture-001',
  channel: 'wechat',
  customer_id: 'customer-fixture-001',
  reply_text: 'Size M is currently available. Please confirm your preferred color before ordering.',
  status: 'draft',
  auto_send: false,
  requires_confirmation: true,
})

export const questionLibraryFixture = Object.freeze([
  {
    question_id: 'q-size-001',
    category: 'size',
    matchers: ['size', 'M', 'available'],
    answer_refs: ['r-size-001'],
    risk_level: 'low',
  },
  {
    question_id: 'q-address-001',
    category: 'shipping_address',
    matchers: ['address', 'shipping'],
    answer_refs: ['r-shipping-001'],
    risk_level: 'medium',
  },
])

export const replyLibraryFixture = Object.freeze([
  {
    reply_id: 'r-size-001',
    category: 'size',
    template: 'Size {size} is available. Please confirm color and order details.',
    allowed_channels: ['wechat'],
    forbidden_phrases: ['guaranteed cure', 'send password', 'private transfer'],
    requires_review: true,
  },
])

export const customerAnalysisFixture = Object.freeze({
  intent: 'size_availability',
  tags: ['pre_sale', 'size_question', 'needs_follow_up'],
  risk: 'medium',
  follow_up: 'Ask customer for preferred color and confirm official order channel.',
  customer_state: {
    stage: 'pre_sale',
    last_contact_at: '2026-07-06T08:00:00.000Z',
  },
})

export const sensitiveWechatPayloadFixture = Object.freeze({
  phone: '13800138000',
  address: '88 Fixture Road, Hangzhou',
  order_id: 'WX202607060001',
  wechat_id: 'fixture_wechat_id',
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
})

export const wechatOpsForbiddenPaths = Object.freeze([
  'runtime/data/secrets',
  'src-tauri/resources/data/secrets',
  '.env',
  'relay-config.json',
  'C:\\Users\\',
  '/Users/',
])

export const noParallelWechatContract = Object.freeze([
  'do not create a second WeChat runner',
  'do not rewrite OpenClaw UI',
  'do not rewrite chat.js',
  'do not split scripts-dev-api.js',
  'do not auto-send WeChat messages',
  'wrap existing OCR and ecommerce Action Guard paths first',
])
