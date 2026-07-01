import assert from 'node:assert/strict'

class MemoryStorage {
  constructor() {
    this.store = new Map()
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }

  setItem(key, value) {
    this.store.set(String(key), String(value))
  }

  removeItem(key) {
    this.store.delete(key)
  }
}

globalThis.localStorage = new MemoryStorage()

let openedUrls = []

function setBrowserWindow({ origin, pathname = '/', search = '' }) {
  const url = new URL(`${origin}${pathname}${search}`)
  openedUrls = []
  globalThis.window = {
    location: {
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      href: url.href,
      hostname: url.hostname,
    },
    dispatchEvent() {},
    open(urlToOpen) {
      openedUrls.push(String(urlToOpen))
      return { closed: false }
    },
  }
}

setBrowserWindow({
  origin: 'http://127.0.0.1:3020',
  search: '?superclawBase=http%3A%2F%2F127.0.0.1%3A1420',
})

const {
  COLLAB_TARGETS,
  openCollaborationPanel,
} = await import('../src/lib/collaboration.js')

const openclawResult = await openCollaborationPanel(COLLAB_TARGETS.openclaw, 'route-openclaw')
assert.equal(openclawResult.url, 'http://127.0.0.1:1420/#/chat')
assert.equal(openedUrls.at(-1), 'http://127.0.0.1:1420/#/chat')

const hermesResult = await openCollaborationPanel(COLLAB_TARGETS.hermes, 'route-hermes')
assert.equal(hermesResult.url, 'http://127.0.0.1:1420/#/h/chat')
assert.equal(openedUrls.at(-1), 'http://127.0.0.1:1420/#/h/chat')

setBrowserWindow({
  origin: 'http://127.0.0.1:3020',
  search: '?superclawBase=https%3A%2F%2Fexample.com%2Fapp',
})

const unsafeResult = await openCollaborationPanel(COLLAB_TARGETS.openclaw, 'route-unsafe')
assert.equal(unsafeResult.url, 'http://127.0.0.1:3020/#/chat')
assert.equal(openedUrls.at(-1), 'http://127.0.0.1:3020/#/chat')

console.log('COLLABORATION_SUPERCLAW_BASE_ROUTING: PASS')
