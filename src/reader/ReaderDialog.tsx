/**
 * ReaderDialog — the single modal primitive behind every reader overlay.
 *
 * Placement is pure CSS (`.reader-dialog__panel--<placement>`):
 *   - `toc`      bottom sheet on mobile, left rail on desktop (≥64rem)
 *   - `settings` bottom sheet on mobile, centered dialog on desktop
 *   - `vocab`    bottom sheet on mobile, right-side drawer on desktop
 *
 * Accessibility contract (research §8.2 / §7 focus-first):
 *   - `role="dialog"` + `aria-modal` with an accessible name
 *   - focus moves into the panel on open, is trapped while open (Tab cycling)
 *   - Escape closes; the scrim is a focusable-disabled button that also closes
 *   - on close, focus returns to the previously-focused element (e.g. the
 *     vocabulary term button that opened it)
 *   - body scroll is locked while any reader dialog is open
 */

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useStrings } from '../i18n/strings'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface ReaderDialogProps {
  open: boolean
  onClose: () => void
  /** Accessible name for the dialog (always required). */
  label: string
  /** Optional visible heading; falls back to `label`. */
  title?: string
  placement: 'toc' | 'settings' | 'vocab'
  /** Optional id applied to the body region (e.g. `aria-controls` target). */
  bodyId?: string
  children: ReactNode
}

export function ReaderDialog({
  open,
  onClose,
  label,
  title,
  placement,
  bodyId,
  children,
}: ReaderDialogProps) {
  const strings = useStrings()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="reader-dialog">
      <button
        type="button"
        className="reader-dialog__backdrop"
        tabIndex={-1}
        aria-label={`${strings.reader.close} (${label})`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`reader-dialog__panel reader-dialog__panel--${placement}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <header className="reader-dialog__header">
          <h2 className="reader-dialog__title" id={title ? titleId : undefined}>
            {title ?? label}
          </h2>
          <button
            type="button"
            className="reader-dialog__close"
            aria-label={strings.reader.close}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="reader-dialog__body" id={bodyId}>
          {children}
        </div>
      </div>
    </div>
  )
}
