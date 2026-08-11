(() => {
  const qs = sel => document.querySelector(sel)
  const qsa = sel => [...document.querySelectorAll(sel)]
  const navItemRoutes = qsa('.nav-section-openclaw-primary .nav-item').map(el => el.dataset.route || '')
  const navItemLabels = qsa('.nav-section-openclaw-primary .nav-item').map(el => (el.textContent || '').trim())
  const hasSessionSidebar = !!qs('.sidebar-nav.sidebar-nav-openclaw')
  const hasPrimarySection = !!qs('.nav-section-openclaw-primary')
  const hasSessionList = !!qs('.openclaw-sidebar-sessions')
  const hermesSessionList = !!qs('#hermes-sidebar-session-list')
  const engineCurrent = qs('.engine-current')
  const allNavItems = qsa('.nav-item').map(el => (el.textContent || '').trim())
  return JSON.stringify({
    activeEngine: document.body?.dataset?.activeEngine || document.documentElement?.dataset?.activeEngine || null,
    hasSessionSidebar,
    hasPrimarySection,
    hasSessionList,
    hermesSessionList,
    primaryNavRoutes: navItemRoutes,
    primaryNavLabels: navItemLabels,
    engineCurrentText: engineCurrent ? (engineCurrent.textContent || '').trim() : null,
    allNavItems,
  }, null, 2)
})()
