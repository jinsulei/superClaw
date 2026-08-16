import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const openclawChat = readFileSync('src/pages/chat.js', 'utf8')
const hermesChat = readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
const hermesCss = readFileSync('src/engines/hermes/style/hermes.css', 'utf8')
const tauriApi = readFileSync('src/lib/tauri-api.js', 'utf8')
const assistantRust = readFileSync('src-tauri/src/commands/assistant.rs', 'utf8')
const libRust = readFileSync('src-tauri/src/lib.rs', 'utf8')

test('OpenClaw 提取本地路径时不再局限于已知扩展名白名单', () => {
  // 任意扩展名（1-10 位字母数字），含未知类型
  assert.match(openclawChat, /\\\.\[A-Za-z0-9\]\{1,10\}/)
  // 注释明确说明「任意扩展名，含未知类型」
  assert.match(openclawChat, /任意扩展名/)
  // 未知类型回退到通用 file 卡片
  assert.match(openclawChat, /\|\| 'file'/)
})

test('OpenClaw 未知文件类型附件卡片提供打开与下载动作', () => {
  // 打开动作
  assert.match(openclawChat, /api\.assistantOpenPath\(localOutputPath\)/)
  // 下载动作走 assistant_download_path（复制到下载目录）
  assert.match(openclawChat, /api\.assistantDownloadPath\(localOutputPath\)/)
})

test('Hermes 文档路径识别支持任意扩展名（含未知类型）', () => {
  // 白名单已扩展为任意扩展名
  assert.match(hermesChat, /HERMES_DOCUMENT_EXTENSION_PATTERN = \/\\\.\[A-Za-z0-9\]\{1,10\}\$\/i/)
  // 提取正则同样支持任意扩展名
  assert.match(hermesChat, /docPathRe = \/[^\n]*\\\.\[A-Za-z0-9\]\{1,10\}/)
  // 未知类型回退 file 卡片
  assert.match(hermesChat, /\|\| 'file'/)
})

test('Hermes 未知文件类型附件卡片提供下载动作', () => {
  // 卡片内嵌下载按钮
  assert.match(hermesChat, /data-hermes-doc-download=/)
  // 点击下载调 assistant_download_path
  assert.match(hermesChat, /api\.assistantDownloadPath\(path\)/)
  // 阻止冒泡，避免误触整卡打开
  assert.match(hermesChat, /event\.stopPropagation\(\).{0,600}assistantDownloadPath/s)
  // 下载按钮样式已定义
  assert.match(hermesCss, /hm-document-card__download/)
})

test('assistant_download_path 从沙箱复制文件到用户下载目录', () => {
  // tauri-api.js 已暴露
  assert.match(tauriApi, /assistantDownloadPath: \(path\) => invoke\('assistant_download_path', \{ path \}\)/)
  // Rust 命令已注册
  assert.match(assistantRust, /pub async fn assistant_download_path\(path: String\)/)
  assert.match(libRust, /assistant::assistant_download_path/)
  // 目标为用户「下载」目录
  assert.match(assistantRust, /dirs::download_dir\(\)/)
  // 通过 copy 复制文件（不移动、不删原文件）
  assert.match(assistantRust, /std::fs::copy\(&source, &destination\)/)
  // 同名文件自动追加序号，避免覆盖
  assert.match(assistantRust, /candidate/)
})
