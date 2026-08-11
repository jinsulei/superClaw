/**
 * Regression smoke test: the packaged Hermes sidebar must render the new-style
 * session layout even when Hermes is not yet configured (no config.yaml).
 *
 * Root cause: the portable build intentionally ships without
 * resources/data/hermes/config.yaml (sanitized by
 * scripts/build-desktop-client.ps1 Prepare-HermesRuntimeConfigDirectory).
 * That made check_hermes report installed=false, _ready=false, and the old
 * getNavItems() returned a 2-item setup menu, so the session-style sidebar
 * (gated on engine.isReady()) never rendered in the packaged app.
 *
 * Fix: getNavItems() always returns the full new-style menu. First entry is not
 * forced into setup and the sidebar shows no "初始设置" entry; when the model is
 * unconfigured the dashboard's inline model-config section guides the user.
 * This smoke test locks that behavior in.
 */
import assert from 'node:assert/strict'
import hermesEngine from '../src/engines/hermes/index.js'

// The module default export is the Hermes engine. In a fresh Node process the
// engine is not ready (no check_hermes round-trip), which mirrors the packaged
// fresh-install state.
assert.equal(hermesEngine.id, 'hermes')
assert.equal(hermesEngine.isReady(), false)

const nav = hermesEngine.getNavItems()
const sections = nav.filter(Boolean)
const items = sections.flatMap(section => section.items || [])
const routes = items.map(item => item.route)

// 1. The full new-style menu must render even when not ready.
const requiredRoutes = [
  '/h/dashboard',
  '/h/chat',
  '/h/sessions',
  '/h/logs',
  '/h/skills',
  '/h/memory',
  '/h/extensions',
  '/models',
  '/payment',
]
for (const route of requiredRoutes) {
  assert.ok(routes.includes(route), `expected full-menu route ${route} to be present`)
}

// 2. The setup entry must NOT be shown, even when not ready.
assert.ok(!routes.includes('/h/setup'), 'setup entry must not appear in the not-ready sidebar')
assert.ok(!items.some(item => item.route === '/h/setup'), 'setup entry must not be in any nav section')

// 3. The first entry must land on the console (dashboard), not the setup wizard.
assert.equal(items[0].route, '/h/dashboard', 'first nav entry should be the dashboard/console')

// 4. The old regression (2-item setup menu when not ready) must never return.
const oldBrokenRoutes = ['/h/setup', '/h/chat']
assert.notDeepEqual(
  routes,
  oldBrokenRoutes,
  'not-ready sidebar must not fall back to the old 2-item setup menu',
)

// 5. Session-style primary nav must exist for Hermes regardless of readiness.
assert.ok(routes.length >= requiredRoutes.length, 'full nav should contain the session-style routes')

console.log(
  `hermes sidebar new-style smoke test passed: not-ready nav has ${routes.length} routes, ` +
  `no setup entry, first entry is ${items[0].route}, full session menu present`,
)
