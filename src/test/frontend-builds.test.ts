import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const libraryOutput = join(process.cwd(), 'dist')
const careerGameOutput = join(process.cwd(), 'dist-career-game')
const publicSupabaseUrl = 'https://shared-browser-config.supabase.co'
const publicSupabaseKey = 'public-anon-key-sentinel'
const serverSecretValues = [
  'server-only-service-role-sentinel',
  'server-only-provider-secret-sentinel',
  'server-only-email-secret-sentinel',
  'server-only-scheduler-secret-sentinel',
]
const buildEnvironment = {
  ...process.env,
  VITE_SUPABASE_URL: publicSupabaseUrl,
  VITE_SUPABASE_ANON_KEY: publicSupabaseKey,
  SUPABASE_SERVICE_ROLE_KEY: serverSecretValues[0],
  PAYPAL_CLIENT_SECRET: serverSecretValues[1],
  RESEND_API_KEY: serverSecretValues[2],
  SCHEDULED_JOB_SECRET: serverSecretValues[3],
}

function outputFingerprint(root: string): string[] {
  const paths: string[] = []

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }

      const digest = createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
      paths.push(`${relative(root, absolutePath)}:${digest}`)
    }
  }

  visit(root)
  return paths.sort()
}

function builtAssetReferences(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((reference): reference is string => reference?.startsWith('/assets/') === true)
}

function builtText(root: string): string {
  const contents: string[] = []

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
      } else if (/\.(?:css|html|js|json|svg)$/.test(entry.name)) {
        contents.push(readFileSync(absolutePath, 'utf8'))
      }
    }
  }

  visit(root)
  return contents.join('\n')
}

describe('dual-frontend build topology', () => {
  beforeAll(() => {
    rmSync(libraryOutput, { recursive: true, force: true })
    rmSync(careerGameOutput, { recursive: true, force: true })
    execFileSync('pnpm', ['build'], {
      cwd: process.cwd(),
      env: buildEnvironment,
      stdio: 'pipe',
    })
  }, 30_000)

  it('the root build emits independent Library and Career Game HTML/assets', () => {
    expect(existsSync(join(libraryOutput, 'index.html'))).toBe(true)
    expect(existsSync(join(careerGameOutput, 'index.html'))).toBe(true)

    const libraryHtml = readFileSync(join(libraryOutput, 'index.html'), 'utf8')
    const careerGameHtml = readFileSync(join(careerGameOutput, 'index.html'), 'utf8')

    expect(builtAssetReferences(libraryHtml)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.js$/), expect.stringMatching(/\.css$/)]),
    )
    expect(builtAssetReferences(careerGameHtml)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.js$/), expect.stringMatching(/\.css$/)]),
    )
    expect(careerGameHtml).toContain('<title>キャリアゲーム | Business Japanese Hub</title>')
  })

  it('a Career Game rebuild leaves the Library artifact byte-for-byte unchanged', () => {
    const libraryBefore = outputFingerprint(libraryOutput)

    execFileSync('pnpm', ['build:career-game'], {
      cwd: process.cwd(),
      env: buildEnvironment,
      stdio: 'pipe',
    })

    expect(outputFingerprint(libraryOutput)).toEqual(libraryBefore)
  })

  it('shares only public Supabase configuration with both browser artifacts', () => {
    for (const output of [libraryOutput, careerGameOutput]) {
      const artifact = builtText(output)

      expect(artifact).toContain(publicSupabaseUrl)
      expect(artifact).toContain(publicSupabaseKey)
      for (const secret of serverSecretValues) expect(artifact).not.toContain(secret)
      for (const secretName of [
        'SUPABASE_SERVICE_ROLE_KEY',
        'PAYPAL_CLIENT_SECRET',
        'RESEND_API_KEY',
        'SCHEDULED_JOB_SECRET',
      ]) {
        expect(artifact).not.toContain(secretName)
      }
    }
  })
})
