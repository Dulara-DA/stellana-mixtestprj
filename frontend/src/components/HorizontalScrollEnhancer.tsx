import { useEffect } from 'react'

const SCROLL_SELECTOR = '.table-shell, .overflow-x-auto'
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, [contenteditable="true"]'
const SCROLL_HELP = 'Drag left or right, use Shift with the mouse wheel, or use the arrow keys to view all columns.'

function horizontalTableFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const container = target.closest<HTMLElement>(SCROLL_SELECTOR)
  if (!container || !container.querySelector('table')) return null
  if (container.scrollWidth <= container.clientWidth + 1) return null
  return container
}

export function HorizontalScrollEnhancer() {
  useEffect(() => {
    const managed = new Set<HTMLElement>()
    const enhance = (root: ParentNode = document) => {
      const containers = [...root.querySelectorAll<HTMLElement>(SCROLL_SELECTOR)]
      if (root instanceof HTMLElement && root.matches(SCROLL_SELECTOR)) containers.unshift(root)
      containers.forEach((container) => {
        if (!container.querySelector('table') || container.dataset.desktopHorizontalScroll === 'true') return
        container.dataset.desktopHorizontalScroll = 'true'
        container.classList.add('desktop-horizontal-scroll')
        if (!container.hasAttribute('tabindex')) container.tabIndex = 0
        if (!container.hasAttribute('aria-label')) container.setAttribute('aria-label', 'Horizontally scrollable production table')
        if (!container.hasAttribute('title')) container.title = SCROLL_HELP
        managed.add(container)
      })
    }

    enhance()
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) enhance(node)
        })
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })

    let draggedContainer: HTMLElement | null = null
    let startX = 0
    let startScrollLeft = 0
    let dragging = false

    const finishDrag = () => {
      if (!draggedContainer) return
      draggedContainer.classList.remove('is-horizontal-dragging')
      draggedContainer.style.removeProperty('user-select')
      draggedContainer.style.removeProperty('scroll-behavior')
      draggedContainer = null
      dragging = false
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return
      const container = horizontalTableFrom(event.target)
      if (!container) return
      draggedContainer = container
      startX = event.clientX
      startScrollLeft = container.scrollLeft
      dragging = false
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!draggedContainer) return
      const distance = event.clientX - startX
      if (!dragging && Math.abs(distance) < 4) return
      dragging = true
      draggedContainer.classList.add('is-horizontal-dragging')
      draggedContainer.style.userSelect = 'none'
      draggedContainer.style.scrollBehavior = 'auto'
      draggedContainer.scrollLeft = startScrollLeft - distance
      event.preventDefault()
    }

    const onWheel = (event: WheelEvent) => {
      const container = horizontalTableFrom(event.target)
      if (!container) return
      const trackpadHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      if (!event.shiftKey && !trackpadHorizontal) return
      const distance = trackpadHorizontal ? event.deltaX : event.deltaY
      if (!distance) return
      container.scrollLeft += distance
      event.preventDefault()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const container = horizontalTableFrom(event.target)
      if (!container || event.target !== container) return
      if (event.key === 'ArrowLeft') {
        container.scrollBy({ left: -120, behavior: 'smooth' })
        event.preventDefault()
      } else if (event.key === 'ArrowRight') {
        container.scrollBy({ left: 120, behavior: 'smooth' })
        event.preventDefault()
      } else if (event.key === 'Home') {
        container.scrollTo({ left: 0, behavior: 'smooth' })
        event.preventDefault()
      } else if (event.key === 'End') {
        container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' })
        event.preventDefault()
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove, { passive: false })
    document.addEventListener('mouseup', finishDrag)
    document.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('keydown', onKeyDown)

    return () => {
      observer.disconnect()
      finishDrag()
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', finishDrag)
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('keydown', onKeyDown)
      managed.forEach((container) => {
        container.classList.remove('desktop-horizontal-scroll')
        delete container.dataset.desktopHorizontalScroll
      })
    }
  }, [])

  return null
}
