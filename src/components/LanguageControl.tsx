import { useEffect, useRef, useState } from 'react'
import { SUPPORTED_LOCALES, setLocalePreference, useLocale, useStrings, type Locale } from '../i18n/strings'

const MENU_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']

export function LanguageControl({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const locale = useLocale()
  const strings = useStrings()
  const [open, setOpen] = useState(false)
  const [activeOptionIndex, setActiveOptionIndex] = useState(() => SUPPORTED_LOCALES.indexOf(locale))
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionsRef = useRef<Array<HTMLButtonElement | null>>([])
  const openAtPointerDownRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!open || variant !== 'desktop') return
    optionsRef.current[activeOptionIndex]?.focus()
  }, [activeOptionIndex, open, variant])

  useEffect(() => {
    if (variant !== 'desktop' || typeof window.matchMedia !== 'function') return
    const desktopQuery = window.matchMedia('(min-width: 80rem)')
    const onBreakpointChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setOpen(false)
    }
    if (typeof desktopQuery.addEventListener === 'function') {
      desktopQuery.addEventListener('change', onBreakpointChange)
      return () => desktopQuery.removeEventListener('change', onBreakpointChange)
    }
    desktopQuery.addListener(onBreakpointChange)
    return () => desktopQuery.removeListener(onBreakpointChange)
  }, [variant])

  useEffect(() => {
    if (!open || variant !== 'desktop') return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, variant])

  const select = (nextLocale: Locale) => {
    setLocalePreference(nextLocale)
    setOpen(false)
    if (variant === 'desktop') triggerRef.current?.focus()
  }

  if (variant === 'mobile') {
    return (
      <fieldset className="language-control language-control--mobile">
        <legend>{strings.language.label}</legend>
        <div className="language-control__choices" role="radiogroup" aria-label={strings.language.label}>
          {SUPPORTED_LOCALES.map((option) => (
            <label className="language-control__radio" key={option} lang={option}>
              <input
                type="radio"
                name="site-language-mobile"
                value={option}
                checked={locale === option}
                onChange={() => select(option)}
              />
              <span>{strings.language.options[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  return (
    <div className="language-control language-control--desktop" ref={rootRef}>
      <button
        className="language-control__trigger"
        ref={triggerRef}
        type="button"
        aria-label={`${strings.language.label}: ${strings.language.options[locale]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={() => { openAtPointerDownRef.current = open }}
        onPointerCancel={() => { openAtPointerDownRef.current = null }}
        onClick={() => {
          // Focusing the trigger from an open menu blurs the current option,
          // whose blur handler closes it before this click runs. Use the
          // pointerdown snapshot so that click still toggles the menu closed.
          const wasOpen = openAtPointerDownRef.current ?? open
          openAtPointerDownRef.current = null
          if (wasOpen) {
            setOpen(false)
          } else {
            setActiveOptionIndex(SUPPORTED_LOCALES.indexOf(locale))
            setOpen(true)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault()
            setOpen(false)
            triggerRef.current?.focus()
            return
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveOptionIndex(SUPPORTED_LOCALES.indexOf(locale))
            setOpen(true)
            requestAnimationFrame(() => optionsRef.current[SUPPORTED_LOCALES.indexOf(locale)]?.focus())
          }
        }}
      >
        <span lang={locale}>{strings.language.options[locale]}</span>
        <span className="language-control__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          className="language-control__menu"
          role="menu"
          aria-label={strings.language.label}
          tabIndex={-1}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget
            if (
              nextTarget === triggerRef.current ||
              !(nextTarget instanceof Node && rootRef.current?.contains(nextTarget))
            ) {
              setOpen(false)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              triggerRef.current?.focus()
              return
            }
            if (!MENU_KEYS.includes(event.key)) return
            event.preventDefault()
            const currentIndex = optionsRef.current.indexOf(document.activeElement as HTMLButtonElement)
            const nextIndex = event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? SUPPORTED_LOCALES.length - 1
                : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length
            setActiveOptionIndex(nextIndex)
            optionsRef.current[nextIndex]?.focus()
          }}
        >
          {SUPPORTED_LOCALES.map((option, index) => (
            <button
              className="language-control__option"
              key={option}
              ref={(element) => { optionsRef.current[index] = element }}
              type="button"
              role="menuitemradio"
              aria-checked={locale === option}
              tabIndex={activeOptionIndex === index ? 0 : -1}
              lang={option}
              onClick={() => select(option)}
            >
              <span>{strings.language.options[option]}</span>
              <span className="language-control__check" aria-hidden="true">{locale === option ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
