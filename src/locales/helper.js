/**
 * i18n 多语言辅助函数
 * 精简版本：仅保留 zh-CN 和 en
 */
export const SUPPORTED_LANGS = ['zh-CN', 'en']

export function _(zhCN, en) {
  return {
    'zh-CN': zhCN,
    en: en || zhCN,
  }
}
