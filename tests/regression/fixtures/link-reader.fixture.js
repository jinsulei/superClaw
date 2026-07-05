export const douyinShareUrlFixture = {
  platform: 'douyin',
  url: 'https://www.douyin.com/video/123456',
  expectedPlatform: 'douyin',
}

export const kuaishouShareUrlFixture = {
  platform: 'kuaishou',
  url: 'https://www.kuaishou.com/short-video/3xabc123',
  expectedPlatform: 'kuaishou',
}

export const xiaohongshuShareUrlFixture = {
  platform: 'xiaohongshu',
  url: 'https://www.xiaohongshu.com/explore/65abcdef0000000012345678',
  expectedPlatform: 'xiaohongshu',
}

export const shipinhaoShareUrlFixture = {
  platform: 'shipinhao',
  url: 'https://channels.weixin.qq.com/platform/post/1234567890',
  expectedPlatform: 'shipinhao',
}

export const bilibiliShareUrlFixture = {
  platform: 'bilibili',
  url: 'https://www.bilibili.com/video/BV1xx411c7mD',
  expectedPlatform: 'bilibili',
}

export const normalWebUrlFixture = {
  platform: 'webpage',
  url: 'https://example.com/articles/link-reader-baseline',
  expectedPlatform: 'webpage',
}

export const metadataOnlyMaterialFixture = {
  url: douyinShareUrlFixture.url,
  platform: 'douyin',
  status: 'partial',
  material_level: 'metadata_only',
  title: 'Fixture short video title',
  description: 'Fixture public metadata summary only.',
  keywords: ['fixture', 'metadata', 'link-reader'],
  cover: 'https://example.test/cover.jpg',
  visible_text: 'Only public metadata is available for this fixture.',
  transcript_available: false,
  subtitle_available: false,
  audio_transcript_available: false,
  frame_ocr_available: false,
  material_limitations: [
    'metadata_only',
    'no transcript',
    'no subtitle',
    'no audio transcript',
    'no frame OCR',
  ],
}

export const webpageTextMaterialFixture = {
  url: normalWebUrlFixture.url,
  platform: 'webpage',
  status: 'completed',
  material_level: 'webpage_text',
  title: 'Fixture readable webpage',
  visible_text: 'Fixture webpage body text that is safe to show.',
  transcript_available: false,
  subtitle_available: false,
  audio_transcript_available: false,
  frame_ocr_available: false,
}

export const failedFetchMaterialFixture = {
  url: 'https://example.invalid/unreachable',
  platform: 'webpage',
  status: 'failed',
  material_level: 'fetch_failed',
  error_code: 'LINK_FETCH_FAILED',
  error_message: 'Fixture fetch failed before content extraction.',
  visible_text: 'Link reading failed. Please provide page text, title, summary, or target direction.',
}

export const topCommentsFixture = [
  { id: 'comment_1', type: 'comment', text: 'Main comment one.', like_count: 120 },
  { id: 'comment_2', type: 'comment', text: 'Main comment two.', like_count: 98 },
  { id: 'comment_3', type: 'comment', text: 'Main comment three.', like_count: 76 },
  { id: 'comment_4', type: 'comment', text: 'Main comment four.', like_count: 64 },
  { id: 'comment_5', type: 'comment', text: 'Main comment five.', like_count: 52 },
]

export const nestedRepliesFixture = {
  parent: { id: 'comment_parent', type: 'comment', text: 'Parent comment.' },
  replies: [
    { id: 'reply_1', type: 'reply', text: 'First child reply.' },
    { id: 'reply_2', type: 'child_reply', text: 'Second child reply.' },
    { id: 'reply_3', type: 'comment_reply', text: 'Third child reply.' },
  ],
  nested_replies: [
    { id: 'nested_1', type: 'nested_reply', text: 'Nested reply should not enter top comments.' },
  ],
}

export const unsafeUrlFixtures = [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://0.0.0.0',
  'http://169.254.169.254/latest/meta-data',
  'file:///C:/Windows/win.ini',
  'ftp://example.com/file',
  'javascript:alert(1)',
]

export const sensitiveLinkPayloadFixture = {
  api_key: 'fake-api-key-should-be-redacted',
  token: 'fake-token-should-be-redacted',
  cookie: 'fake-cookie-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  access_token: 'fake-access-token-should-be-redacted',
  refresh_token: 'fake-refresh-token-should-be-redacted',
  password: 'fake-password-should-be-redacted',
}
