import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Right-hand slide-over panel.
 *
 * Rendered inline (not via a portal) — the app has no stacking contexts that
 * would clip a `fixed` child, and staying in the tree keeps React context
 * (environment, auth) available to the contents without re-providing it.
 */
export default function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  width = 'max-w-3xl',
}: {
  readonly open: boolean
  readonly title: string
  readonly subtitle?: React.ReactNode
  readonly onClose: () => void
  /**
   * Fills the area below the header as a `min-h-0` flex column — the consumer
   * owns scrolling, so it can pin its own action bar below a scrolling body.
   */
  readonly children: React.ReactNode
  readonly width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Drives the enter transition: the panel mounts translated off-screen, then
  // flips to `entered` on the next frame so the browser has two distinct
  // states to animate between.
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [open])

  // Esc closes. Bound to the document so it works regardless of focus position.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock background scroll while open, so the page behind doesn't move when
  // the cursor leaves the panel.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Move focus into the panel on open so keyboard and screen-reader users land
  // inside the dialog rather than back at the top of the page.
  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
    )
    first?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex h-full w-full ${width} flex-col bg-gray-50 shadow-2xl transition-transform duration-300 ease-out ${
          entered ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold tracking-tight text-gray-900">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-gray-400">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
