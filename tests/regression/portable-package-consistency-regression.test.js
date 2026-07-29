import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const buildScript = readFileSync('scripts/build-desktop-client.ps1', 'utf8')
const verifier = readFileSync('scripts/verify-portable-package.ps1', 'utf8')

test('desktop build requires a source-to-package consistency verification', () => {
  assert.match(packageJson.scripts['verify:desktop'], /verify-portable-package\.ps1/)
  assert.match(buildScript, /Step "Verifying source-to-package consistency"/)
  assert.match(buildScript, /verify-portable-package\.ps1/)
  assert.match(buildScript, /-RequireFresh/)
  assert.match(buildScript, /-WriteManifest/)
})

test('portable verifier checks executable, shared runtimes, plugins, freshness, and source paths', () => {
  assert.match(verifier, /Compare-File \$sourceExe \$packageExe "desktop executable"/)
  assert.match(verifier, /shared OCR runner/)
  assert.match(verifier, /Claude panel server/)
  assert.match(verifier, /OpenClaw media plugin/)
  assert.match(verifier, /Package is older than current source\/build input/)
  assert.match(verifier, /package-manifest\.json/)
  assert.match(verifier, /source-machine repository path/)
})
