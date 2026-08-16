import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Keep the suite's historical default deterministic now that locale is derived
// from browser preferences. Individual locale tests may override these values.
Object.defineProperty(window.navigator, 'language', {
  configurable: true,
  value: 'ja-JP',
})
Object.defineProperty(window.navigator, 'languages', {
  configurable: true,
  value: ['ja-JP'],
})

// jsdom does not implement window.scrollTo; Layout's route-navigation effect
// calls it on push/replace. A silent no-op keeps tests deterministic and quiet;
// scroll behavior is asserted via spies in App.test.tsx.
window.scrollTo = () => {}

beforeEach(() => {
  // Locale preference is presentation state, not durable test state. Each test
  // starts from the deterministic browser locale above unless it opts in.
  window.localStorage.removeItem('business-japanese-hub.locale')
})

// Vitest runs without `globals: true`, so testing-library's auto-cleanup is
// not registered. Clean up the DOM between tests explicitly to avoid
// duplicate-element queries leaking across tests.
afterEach(() => {
  cleanup()
  window.localStorage.removeItem('business-japanese-hub.locale')
})
