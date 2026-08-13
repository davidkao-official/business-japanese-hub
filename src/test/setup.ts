import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement window.scrollTo; Layout's route-navigation effect
// calls it on push/replace. A silent no-op keeps tests deterministic and quiet;
// scroll behavior is asserted via spies in App.test.tsx.
window.scrollTo = () => {}

// Vitest runs without `globals: true`, so testing-library's auto-cleanup is
// not registered. Clean up the DOM between tests explicitly to avoid
// duplicate-element queries leaking across tests.
afterEach(() => {
  cleanup()
})
