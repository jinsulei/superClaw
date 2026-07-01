import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const scriptPath = path.join(root, 'scripts', 'build-desktop-client.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')
const openclawConfigStart = script.indexOf('function Write-PortableOpenClawConfig')
const openclawConfigEnd = script.indexOf('function Write-PortablePanelConfig')
const openclawConfigBlock = script.slice(openclawConfigStart, openclawConfigEnd)

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`)
    process.exitCode = 1
  } else {
    console.log(`PASS ${message}`)
  }
}

function assertIncludes(text, needle, message) {
  assert(text.includes(needle), message)
}

function assertNotIncludes(text, needle, message) {
  assert(!text.includes(needle), message)
}

function assertNotMatches(text, pattern, message) {
  assert(!pattern.test(text), message)
}

assertIncludes(script, 'function Remove-PackagedRuntimeState', 'desktop package removes runtime state')
assertIncludes(script, 'function Assert-CleanPackageForRelease', 'desktop package asserts clean release package')
assertIncludes(script, 'Remove-PackagedRuntimeState $OutDir', 'final package cleanup calls runtime state sanitizer')
assertIncludes(script, 'Assert-CleanPackageForRelease $OutDir', 'final package verification calls release sanitizer')

for (const blocked of ['config.yaml', '.env', '.env.local', 'user-memory.json']) {
  assertIncludes(script, `"${blocked}"`, `sanitizer blocks ${blocked}`)
}

assertIncludes(
  script,
  '\\\\resources\\\\data\\\\claude-code\\\\home\\\\claude-config\\\\projects',
  'sanitizer blocks ClaudeCode project runtime directory',
)
assertIncludes(script, '\\\\resources\\\\data\\\\hermes\\\\memory', 'sanitizer blocks Hermes memory runtime directory')

assertIncludes(openclawConfigBlock, '$providers = [ordered]@{}', 'OpenClaw config starts with no invalid provider placeholders')
assertNotIncludes(openclawConfigBlock, 'needsSetup = $true', 'OpenClaw config does not write UI-only needsSetup fields')
assertNotIncludes(openclawConfigBlock, '"openai-compatible" = [ordered]@{', 'OpenClaw config does not ship empty openai-compatible provider')

assertNotIncludes(script, '$MiniMaxTestBaseUrl', 'desktop build script no longer carries fixed MiniMax base URL constant')
assertNotIncludes(script, '$MiniMaxTestModel', 'desktop build script no longer carries fixed MiniMax model constant')
assertIncludes(script, 'function Set-SanitizedTestBuildEnv', 'sanitized build has an explicit test-only environment helper')
assertIncludes(script, 'if (-not $SanitizedTest) { return @{} }', 'sanitized test flags are gated behind the SanitizedTest switch')
assertIncludes(script, 'VITE_SUPERCLAW_FORCE_PROVIDER', 'sanitized test package exposes a frontend provider smoke flag')
assertNotIncludes(script, 'VITE_SUPERCLAW_MINIMAX_BASE_URL', 'sanitized build does not embed MiniMax base URL')
assertNotIncludes(script, 'VITE_SUPERCLAW_MINIMAX_MODEL', 'sanitized build does not embed MiniMax model')
assertIncludes(script, 'VITE_SUPERCLAW_TEST_BUILD', 'sanitized test package exposes a frontend test-build flag')
assertNotIncludes(script, 'Repair-HermesConfig', 'Hermes config writer was removed')
assertNotIncludes(script, 'apiKey = "YOUR_API_KEY"', 'package does not ship placeholder API key as runtime config')
assertNotIncludes(script, 'defaultProvider = "minimax"', 'package does not default Claude relay provider to MiniMax')

assertNotMatches(
  script,
  /Set-Content\s+-Path\s+\$configPath[\s\S]*?model:\s*[\r\n]+\s*default:/,
  'desktop package does not write Hermes config.yaml model defaults',
)
assertNotMatches(script, /provider\s*=\s*"minimax"/, 'desktop package does not hard-code default provider as MiniMax')
assertNotMatches(script, /model\s*=\s*"MiniMax-M3"/, 'desktop package does not hard-code default model as MiniMax-M3')
assertNotMatches(script, /baseUrl\s*=\s*"https:\/\/api\.minimaxi\.com\/v1"/, 'desktop package does not hard-code MiniMax base URL')
assertNotMatches(script, /provider\s*=\s*"yyapi"/i, 'desktop package does not hard-code default provider as yyapi')

if (process.exitCode) {
  process.exit(process.exitCode)
}

console.log('PASS smoke-desktop-package-runtime-config-sanitizer')
