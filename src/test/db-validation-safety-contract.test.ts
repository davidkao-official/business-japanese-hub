import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('database validation safety contract', () => {
  it('routes the current Career Game validation checklist through the owned guard', () => {
    const document = read('docs/career-game-validation.md')

    expect(document).toContain('pnpm test:db-guard')
    expect(document).toContain('pnpm validate:db')
    expect(document).toContain('docs/db-validation.md')
    expect(document).not.toMatch(/^supabase db (?:start|reset|stop)\b/m)
    expect(document).not.toMatch(/^supabase test db\b/m)
    expect(document).not.toMatch(/^supabase db lint\b/m)
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
