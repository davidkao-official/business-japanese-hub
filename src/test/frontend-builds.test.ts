import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const libraryOutput = join(process.cwd(), 'dist')
const careerGameOutput = join(process.cwd(), 'dist-career-game')
const publicSupabaseUrl = 'https://shared-browser-config.supabase.co'
const publicSupabaseKey = 'public-anon-key-sentinel'
const publicFunctionsBaseUrl = 'https://functions-public-config.example/functions/v1'
const publicLibraryOrigin = 'https://library-public-config.example'
const publicCareerGameOrigin = 'https://career-game-public-config.example'
const serverSecretNames = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'ECPAY_MERCHANT_ID',
  'ECPAY_HASH_KEY',
  'ECPAY_HASH_IV',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
  'RESEND_API_KEY',
  'SCHEDULED_JOB_SECRET',
] as const
const serverSecretValues = [
  'server-only-service-role-sentinel',
  'server-only-database-password-sentinel',
  'server-only-ecpay-merchant-sentinel',
  'server-only-ecpay-hash-key-sentinel',
  'server-only-ecpay-hash-iv-sentinel',
  'server-only-paypal-client-sentinel',
  'server-only-paypal-secret-sentinel',
  'server-only-paypal-webhook-sentinel',
  'server-only-email-secret-sentinel',
  'server-only-scheduler-secret-sentinel',
] as const
const buildEnvironment = {
  ...process.env,
  VITE_SUPABASE_URL: publicSupabaseUrl,
  VITE_SUPABASE_ANON_KEY: publicSupabaseKey,
  VITE_EDGE_FUNCTIONS_BASE_URL: publicFunctionsBaseUrl,
  VITE_LIBRARY_ORIGIN: publicLibraryOrigin,
  VITE_CAREER_GAME_ORIGIN: publicCareerGameOrigin,
  ...Object.fromEntries(serverSecretNames.map((name, index) => [name, serverSecretValues[index]])),
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
    expect(libraryHtml).toContain('<title>ビジネス日本語ハブ</title>')
    expect(careerGameHtml).toContain('<title>キャリアゲーム | Business Japanese Hub</title>')
    expect(existsSync(join(libraryOutput, '404.html'))).toBe(false)
    expect(existsSync(join(careerGameOutput, '404.html'))).toBe(false)
    expect(outputFingerprint(libraryOutput)).not.toEqual(outputFingerprint(careerGameOutput))
  })

  it('the validated Career Game deploy build leaves the Library artifact unchanged', () => {
    const sentinelPath = join(libraryOutput, '.career-game-deploy-must-not-touch-library')
    const sentinel = 'Library deploy-isolation sentinel'
    writeFileSync(sentinelPath, sentinel)
    const libraryBefore = outputFingerprint(libraryOutput)

    try {
      execFileSync('pnpm', ['build:career-game:deploy'], {
        cwd: process.cwd(),
        env: buildEnvironment,
        stdio: 'pipe',
      })

      expect(readFileSync(sentinelPath, 'utf8')).toBe(sentinel)
      expect(outputFingerprint(libraryOutput)).toEqual(libraryBefore)
    } finally {
      rmSync(sentinelPath, { force: true })
    }
  }, 30_000)

  it('the validated Library deploy build leaves the Career Game artifact unchanged', () => {
    const sentinelPath = join(careerGameOutput, '.library-deploy-must-not-touch-career-game')
    const sentinel = 'Career Game deploy-isolation sentinel'
    writeFileSync(sentinelPath, sentinel)
    const careerGameBefore = outputFingerprint(careerGameOutput)

    try {
      execFileSync('pnpm', ['build:library:deploy'], {
        cwd: process.cwd(),
        env: buildEnvironment,
        stdio: 'pipe',
      })

      expect(readFileSync(sentinelPath, 'utf8')).toBe(sentinel)
      expect(outputFingerprint(careerGameOutput)).toEqual(careerGameBefore)
    } finally {
      rmSync(sentinelPath, { force: true })
    }
  }, 30_000)

  it('shares public browser configuration without leaking server credentials', () => {
    for (const output of [libraryOutput, careerGameOutput]) {
      const artifact = builtText(output)

      expect(artifact).toContain(publicSupabaseUrl)
      expect(artifact).toContain(publicSupabaseKey)
      expect(artifact).toContain(publicFunctionsBaseUrl)
      for (const secret of serverSecretValues) expect(artifact).not.toContain(secret)
      for (const secretName of serverSecretNames) expect(artifact).not.toContain(secretName)
    }

    const libraryArtifact = builtText(libraryOutput)
    const careerGameArtifact = builtText(careerGameOutput)
    expect(libraryArtifact).toContain(publicCareerGameOrigin)
    expect(careerGameArtifact).toContain(publicLibraryOrigin)
  })
})
