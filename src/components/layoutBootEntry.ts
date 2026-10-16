/**
 * The history entry the document booted on. Layout skips focus/scroll for it
 * exactly once per document; any later arrival at a Layout route, including a
 * return to this same entry from the Reader, is a navigation.
 *
 * With BrowserRouter the boot key is `history.state.key` (kept across a reload
 * of a pushed entry) or `'default'`. App imports Layout eagerly, so this module
 * evaluates before any navigation. It has no imports so the test setup can
 * reset it without loading the component tree.
 */
let bootEntry = readBootEntry()

function readBootEntry() {
  const state = typeof window === 'undefined' ? null : (window.history.state as { key?: string } | null)
  return { key: state?.key ?? 'default', skipped: false }
}

/** True exactly once: for the boot entry on its first handling. */
export function consumeBootEntry(locationKey: string): boolean {
  if (bootEntry.skipped || locationKey !== bootEntry.key) return false
  bootEntry.skipped = true
  return true
}

/** Test-only: treat the next render as a fresh document load. */
export function resetBootEntry(): void {
  bootEntry = readBootEntry()
}
