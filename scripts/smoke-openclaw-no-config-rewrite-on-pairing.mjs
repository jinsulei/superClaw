import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const source = readFileSync(resolve(root, 'scripts/dev-api.js'), 'utf8')

assert.match(source, /function\s+normalizeOpenClawConfigForCompare\s*\(/, 'OpenClaw config compare normalizer is missing')
assert.match(source, /function\s+shouldWriteOpenClawConfig\s*\(/, 'OpenClaw config write guard is missing')
assert.match(source, /function\s+stableJsonStringify\s*\(/, 'Stable JSON compare helper is missing')
assert.match(source, /delete\s+normalized\.meta\.lastTouchedAt/, 'Config compare must ignore transient meta.lastTouchedAt')
assert.match(source, /allowedOrigins\s*=\s*\[\.\.\.new Set\(origins\.filter\(Boolean\)\)\]\.sort\(\)/, 'Config compare must canonicalize allowedOrigins')
assert.match(source, /if\s*\(!options\.force\s*&&\s*!shouldWriteOpenClawConfig\(cleaned\)\)\s*\{[\s\S]*?configUnchanged:\s*true/, 'writeOpenclawConfigFile must skip unchanged config writes')
assert.match(source, /const\s+writeResult\s*=\s*writeOpenclawConfigFile\(calibrated,\s*\{\s*preserveExisting:\s*false\s*\}\)/, 'Calibration must use guarded config write')
assert.match(source, /configUnchanged:\s*!writeResult\.written/, 'Calibration must report unchanged config')
assert.match(source, /if\s*\(origins\.every\(o\s*=>\s*existing\.includes\(o\)\)\)\s*return\s+false/, 'Gateway origin patch must be idempotent')

console.log('OPENCLAW_NO_CONFIG_REWRITE_ON_PAIRING: PASS')
