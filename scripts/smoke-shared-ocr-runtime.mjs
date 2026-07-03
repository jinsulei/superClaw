import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const runtimeDir = join(root, 'src-tauri', 'resources', 'runtime', 'ocr')
const runner = join(runtimeDir, 'ocr-runner.cjs')

function assertFile(path, minBytes, label) {
  assert.ok(existsSync(path), `${label} is missing: ${path}`)
  assert.ok(statSync(path).size >= minBytes, `${label} is too small`)
}

assertFile(runner, 1000, 'OCR runner')
assertFile(join(runtimeDir, 'package.json'), 100, 'OCR package')
assertFile(join(runtimeDir, 'package-lock.json'), 100, 'OCR package lock')
assertFile(join(runtimeDir, 'node_modules', 'tesseract.js', 'package.json'), 100, 'tesseract.js package')
assertFile(join(runtimeDir, 'node_modules', 'tesseract.js-core', 'package.json'), 100, 'tesseract.js-core package')
assertFile(join(runtimeDir, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm'), 100000, 'tesseract wasm')
assertFile(join(runtimeDir, 'tessdata', 'eng.traineddata.gz'), 512000, 'English traineddata')
assertFile(join(runtimeDir, 'tessdata', 'chi_sim.traineddata.gz'), 1048576, 'Chinese traineddata')

const syntax = spawnSync(process.execPath, ['--check', runner], { cwd: root, encoding: 'utf8' })
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout)

const health = spawnSync(process.execPath, [runner, '--health'], { cwd: root, encoding: 'utf8' })
assert.equal(health.status, 0, health.stderr || health.stdout)
const parsed = JSON.parse(health.stdout)
assert.equal(parsed.ok, true)
assert.equal(parsed.packageReady, true)
assert.deepEqual(parsed.missing, [])

console.log('SMOKE_SHARED_OCR_RUNTIME=PASS')
