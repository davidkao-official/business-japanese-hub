import { describe, expect, it, vi } from 'vitest'
import { releaseStore } from './release-store.ts'
import type { DbClient } from '../_shared/db.ts'

function database(error: { message: string } | null): DbClient {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error }),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  return { from: vi.fn().mockReturnValue(builder), rpc: vi.fn(), auth: {} } as unknown as DbClient
}

describe('practice-attempts release lookup', () => {
  it('fails closed without logging an arbitrary database error message', async () => {
    const error = { message: 'secret row value and database URL must stay private' }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(releaseStore(database(error))('content-id', 'revision')).resolves.toEqual({ kind: 'unavailable' })
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalledWith(expect.anything(), error.message)

    consoleError.mockRestore()
  })
})
