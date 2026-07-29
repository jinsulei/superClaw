// Keeps the image point below the pointer stationary across successive zooms.
// CSS transform-origin alone drifts after the first wheel event because its
// percentages are calculated from an already-transformed rectangle.
export function attachAnchoredImageZoom({ viewport, image, minZoom = 0.5, maxZoom = 4, step = 0.14, onChange } = {}) {
  if (!viewport || !image) return { reset() {}, destroy() {} }

  let zoom = 1
  let panX = 0
  let panY = 0

  const apply = () => {
    image.style.transformOrigin = 'center center'
    image.style.transform = `translate(${panX.toFixed(2)}px, ${panY.toFixed(2)}px) scale(${zoom})`
    onChange?.({ zoom, panX, panY })
  }

  const reset = () => {
    zoom = 1
    panX = 0
    panY = 0
    apply()
  }

  const onWheel = event => {
    event.preventDefault()
    const nextZoom = Math.min(maxZoom, Math.max(minZoom, Math.round((zoom + (event.deltaY < 0 ? step : -step)) * 100) / 100))
    if (nextZoom === zoom) return

    const rect = image.getBoundingClientRect()
    // The transformed rectangle center minus the tracked translation gives us
    // the stable layout center of the untransformed image.
    const baseCenterX = rect.left + rect.width / 2 - panX
    const baseCenterY = rect.top + rect.height / 2 - panY
    const localX = (event.clientX - baseCenterX - panX) / zoom
    const localY = (event.clientY - baseCenterY - panY) / zoom

    panX = event.clientX - baseCenterX - localX * nextZoom
    panY = event.clientY - baseCenterY - localY * nextZoom
    zoom = nextZoom
    apply()
  }

  viewport.addEventListener('wheel', onWheel, { passive: false })
  image.addEventListener('dblclick', reset)
  apply()

  return {
    reset,
    destroy() {
      viewport.removeEventListener('wheel', onWheel)
      image.removeEventListener('dblclick', reset)
    },
  }
}
