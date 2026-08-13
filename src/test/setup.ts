import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without `globals: true`, so testing-library's auto-cleanup is
// not registered. Clean up the DOM between tests explicitly to avoid
// duplicate-element queries leaking across tests.
afterEach(() => {
  cleanup()
})
