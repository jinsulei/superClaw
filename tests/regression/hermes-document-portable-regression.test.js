import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const chat = readFileSync('src/engines/hermes/pages/chat.js', 'utf8')
const api = readFileSync('src/lib/tauri-api.js', 'utf8')
const rust = readFileSync('src-tauri/src/commands/hermes.rs', 'utf8')
const lib = readFileSync('src-tauri/src/lib.rs', 'utf8')
const tool = readFileSync('src-tauri/resources/runtime/document-tools/hermes_document_tool.py', 'utf8')
const build = readFileSync('scripts/build-desktop-client.ps1', 'utf8')
const devApi = readFileSync('scripts/dev-api.js', 'utf8')

test('Hermes accepts portable Excel, Word, PowerPoint, and PDF attachments through the native bridge', () => {
  assert.match(chat, /image\/\*,\.txt,\.md,\.json,\.csv,\.xlsx,\.docx,\.pptx,\.pdf/)
  assert.match(chat, /function isSupportedHermesDocument/)
  assert.match(chat, /api\.hermesSaveDocumentAttachment/)
  assert.match(api, /hermesSaveDocumentAttachment/)
  assert.match(rust, /pub async fn hermes_save_document_attachment/)
  assert.match(rust, /"xlsx" \| "docx" \| "pptx" \| "pdf"/)
  assert.match(lib, /hermes::hermes_save_document_attachment/)
  assert.match(devApi, /async hermes_save_document_attachment/)
  assert.match(devApi, /Only \.xlsx, \.docx, \.pptx, and \.pdf documents are supported/)
})

test('Hermes document edits are explicit and preserve uploaded originals', () => {
  assert.match(rust, /always write --output to a new file/)
  assert.match(rust, /do not overwrite the uploaded original/)
  assert.match(tool, /--output is required for edits/)
  assert.match(tool, /replace_excel/)
  assert.match(tool, /replace_word/)
  assert.match(tool, /watermark_pdf/)
})

test('Hermes document tool resolves bundled dependencies and paths portably', () => {
  assert.match(tool, /runtime_dir = Path\(__file__\)\.resolve\(\)\.parent\.parent/)
  assert.match(tool, /runtime_dir \/ "hermes-agent" \/ "Lib" \/ "site-packages"/)
  assert.match(rust, /app_resources_dir\(\)/)
  assert.match(rust, /join\("runtime"\)[\s\S]*join\("document-tools"\)/)
  assert.match(rust, /hermes_agent_python\(\)/)
  assert.match(devApi, /function hermesDocumentToolPath\(\)/)
  assert.match(devApi, /hermesPortablePython\(\) \|\| 'python'/)
  assert.match(devApi, /\[SuperClaw attached documents\]/)
  assert.match(tool, /create-presentation/)
  assert.match(rust, /clean-excel <file> --output <new-file>/)
  assert.match(devApi, /clean-excel <file> --output <new-file>/)
  assert.match(`${chat}\n${rust}\n${devApi}`, /Do not use execute_code for attached-document work/)
  assert.doesNotMatch(`${chat}\n${api}\n${rust}\n${tool}`, /C:\\Users\\|C:\\tmp\\/)
})

test('portable build verifies the bundled Hermes document tool and dependencies', () => {
  assert.match(build, /import openpyxl; import docx; import pptx; import pypdf; import reportlab/)
  assert.match(build, /aiohttp openpyxl python-docx python-pptx pypdf reportlab/)
  assert.match(build, /runtime\\document-tools\\hermes_document_tool\.py/)
})
