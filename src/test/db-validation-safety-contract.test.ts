import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const rawDbCommand = /^(?:supabase db (?:start|reset|stop|lint)|supabase test db)\b/m

const liveValidationDocs = [
  'docs/career-game-validation.md',
  'docs/accounts-and-entitlement.md',
  'docs/payments/implementation-contract.md',
  'docs/deployment.md',
] as const

describe('database validation safety contract', () => {
  it('routes every current local DB validation checklist through the owned guard', () => {
    for (const path of liveValidationDocs) {
      const document = read(path)

      expect(document, path).toContain('pnpm test:db-guard')
      expect(document, path).toContain('pnpm validate:db')
      expect(document, path).toMatch(/(?:docs\/)?db-validation\.md/)
      expect(document, path).not.toMatch(rawDbCommand)
    }
  })

  it('keeps exact-HEAD and pull-request merge-result CI as separate gates', () => {
    const workflow = read('.github/workflows/ci.yml')
    const mergeResult = workflow.slice(workflow.indexOf('  merge-result-gate:'))

    expect(workflow).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}")
    expect(workflow).toContain('  merge-result-gate:')
    expect(mergeResult).toContain("if: github.event_name == 'pull_request'")
    expect(mergeResult).toContain('Checkout PR merge result')
    expect(mergeResult).not.toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}")
    expect(workflow.match(/run: pnpm validate:db/g)).toHaveLength(2)
  })
})
