import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const productIaCss = readFileSync(join(process.cwd(), 'src/styles/product-ia.css'), 'utf8')

describe('product IA Learn module typography', () => {
  it('scopes module link typography to direct children', () => {
    expect(productIaCss).toContain('.learning-module-link > span:first-child')
    expect(productIaCss).toContain('.learning-module-link > span:nth-child(2)')
    expect(productIaCss).toContain('.learning-module-link > span:last-child')
    expect(productIaCss).not.toContain('.learning-module-link span:first-child')
    expect(productIaCss).not.toContain('.learning-module-link span:nth-child(2)')
    expect(productIaCss).not.toContain('.learning-module-link span:last-child')
  })
})
