import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.')
const read = (relative) => readFileSync(resolve(root, relative), 'utf8')

test('shared file service keeps data portable and never overwrites source files', () => {
  const source = read('src-tauri/src/commands/file_service.rs')
  assert.match(source, /app_resources_dir\(\)/)
  assert.match(source, /\.dev-data[\s\S]*file-workspaces/)
  assert.match(source, /resources\.join\("data"\)\.join\("file-workspaces"\)/)
  assert.match(source, /operation != "preview"/)
  assert.match(source, /let output = task_dir\.join\(output_name\)/)
  assert.match(source, /"xlsx" \| "docx" \| "pdf" \| "pptx"/)
  assert.match(source, /create-presentation/)
})

test('all three agents use the same bundled document service', () => {
  const openclaw = read('src/pages/chat.js')
  const hermes = read('src-tauri/src/commands/hermes.rs')
  const claudeMcp = read('src-tauri/resources/runtime/claude-panel/local-desktop-mcp.js')
  const portableCli = read('src-tauri/resources/runtime/document-tools/superclaw-file.cmd')

  assert.match(openclaw, /superclaw-file\.cmd/)
  assert.match(hermes, /shared offline file service/i)
  assert.match(claudeMcp, /inspect_local_document/)
  assert.match(claudeMcp, /superclaw-file\.cmd/)
  assert.match(portableCli, /hermes_document_tool\.py/i)
})
