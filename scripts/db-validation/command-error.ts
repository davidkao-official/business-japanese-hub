/** Fixed categories only: never return any original Supabase error text. */
export function safeErrorCategories(stderr: string): string {
  const categories: [string, RegExp][] = [
    ['disk_full', /no space left|ENOSPC/i],
    ['out_of_memory', /out of memory|cannot allocate memory|OOMKilled/i],
    ['connection_refused', /connection refused|ECONNREFUSED/i],
    ['network_timeout', /timed? ?out|timeout|deadline exceeded/i],
    ['dns_resolution', /no such host|ENOTFOUND|EAI_AGAIN|DNS lookup/i],
    ['tls_certificate', /certificate|TLS handshake|x509|SSL/i],
    ['image_pull_rate_limit', /toomanyrequests|rate limit|429/i],
    ['image_pull_access_denied', /pull access denied|unauthorized|403/i],
    ['image_manifest_missing', /manifest unknown|no matching manifest/i],
    ['permission', /permission denied|operation not permitted|read-only file system/i],
    ['unhealthy', /unhealthy|health check failed|not healthy/i],
    ['exec_format', /exec format error/i],
    ['missing_executable', /executable file not found|executable not found/i],
    ['database_initialization', /initdb.*fail|database initialization.*fail/i],
    ['migration_error', /migration.*fail|SQLSTATE|syntax error/i],
  ]
  return categories.filter(([, pattern]) => pattern.test(stderr)).map(([name]) => name).join(', ') || 'unknown'
}

const HARD_INFRASTRUCTURE_CATEGORIES = new Set([
  'disk_full', 'out_of_memory', 'connection_refused', 'network_timeout',
  'dns_resolution', 'tls_certificate', 'image_pull_rate_limit',
  'image_pull_access_denied', 'image_manifest_missing', 'permission',
  'unhealthy', 'exec_format', 'missing_executable', 'database_initialization',
])

export const DB_VALIDATION_DIAGNOSTIC = Symbol('db-validation-diagnostic')

export interface DbValidationDiagnostic {
  kind: 'test-suite' | 'test-file'
  category: string
  infrastructure: boolean
  exitCode: number | null
  path?: string
}

export function dbValidationDiagnostic(error: unknown): DbValidationDiagnostic | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = (error as { [DB_VALIDATION_DIAGNOSTIC]?: unknown })[DB_VALIDATION_DIAGNOSTIC]
  return value && typeof value === 'object' ? value as DbValidationDiagnostic : undefined
}

function infrastructureCategory(categories: string): boolean {
  return categories.split(', ').some(category => HARD_INFRASTRUCTURE_CATEGORIES.has(category))
}

function diagnosticError(message: string, diagnostic: DbValidationDiagnostic): Error {
  const error = new Error(message)
  Object.defineProperty(error, DB_VALIDATION_DIAGNOSTIC, { value: diagnostic })
  return error
}

const TAP_ASSERTION_ORDINAL_MAX = 1_000_000
const TAP_HARNESS_HEADER = /^\s*([A-Za-z0-9._/-]+)\s+\.\.\s*(.*)$/i
const TAP_HARNESS_FAILURE_SIGNAL = /^\s*[A-Za-z0-9._/-]+\s+\.\.\s+Failed\b/im
const TAP_FAILED_TEST = /^\s*#\s*Failed test(?:\s+([0-9]+))?:\s*/i
const TAP_FAILED_TEST_PREFIX = /^\s*#\s*Failed test\b/i
const TAP_FAILED_TEST_SIGNAL = /^\s*#\s*Failed test\b/im
const TAP_SUBTEST_SUMMARY = /^\s*Failed\s+([0-9]+)\/([0-9]+)\s+subtests\s*$/i
const TAP_SUBTEST_SUMMARY_PREFIX = /^\s*Failed\b.*\bsubtests?\b/i
const TAP_SUBTEST_SUMMARY_SIGNAL = /^\s*Failed\b.*\bsubtests?\b/im

function tapOrdinal(value: string): string | null {
  if (!/^[1-9][0-9]{0,6}$/.test(value)) return null
  const ordinal = Number(value)
  return ordinal <= TAP_ASSERTION_ORDINAL_MAX ? String(ordinal) : null
}

function attributedTapFailure(output: string, allowlistedTestPaths: ReadonlySet<string>): string | null {
  type Block = {
    path: string
    passing: boolean
    failedOrdinals: (string | null)[]
    summaries: { failed: string | null; total: string | null }[]
    malformed: boolean
  }
  const blocks: Block[] = []
  let current: Block | null = null
  let malformedOutsideBlock = false
  let malformedBlock = false
  for (const line of output.split(/\r?\n/)) {
    const failedTest = TAP_FAILED_TEST.exec(line)
    const header = TAP_HARNESS_HEADER.exec(line)
    if (header) {
      if (current) blocks.push(current)
      const path = header[1].startsWith('/work/') ? header[1].slice('/work/'.length) : header[1]
      const passing = /^ok\b/i.test(header[2])
      current = { path, passing, failedOrdinals: [], summaries: [], malformed: false }
      if (header[2] && !passing) {
        current.malformed = true
        malformedBlock = true
      }
      continue
    }
    if (failedTest || TAP_FAILED_TEST_PREFIX.test(line)) {
      if (!current) {
        malformedOutsideBlock = true
        continue
      }
      const ordinal = tapOrdinal(failedTest?.[1] ?? '')
      current.failedOrdinals.push(ordinal)
      if (current.passing || !ordinal || current.failedOrdinals.length > 1) current.malformed = true
      continue
    }
    const summary = TAP_SUBTEST_SUMMARY.exec(line)
    if (summary || TAP_SUBTEST_SUMMARY_PREFIX.test(line)) {
      if (!current) {
        malformedOutsideBlock = true
        continue
      }
      const failed = tapOrdinal(summary?.[1] ?? '')
      const total = tapOrdinal(summary?.[2] ?? '')
      current.summaries.push({ failed, total })
      if (current.passing || !failed || !total || Number(failed) > Number(total) || current.summaries.length > 1) current.malformed = true
      continue
    }
  }
  if (current) blocks.push(current)
  if (malformedOutsideBlock || malformedBlock) return null
  const candidates = blocks.filter(block => block.failedOrdinals.length > 0 || block.summaries.length > 0)
  if (candidates.length !== 1) return null
  const [block] = candidates
  if (block.malformed || block.failedOrdinals.length !== 1 || block.summaries.length !== 1) return null
  if (!/^supabase\/tests\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(block.path) || !allowlistedTestPaths.has(block.path)) return null
  const [ordinal] = block.failedOrdinals
  const [summary] = block.summaries
  if (!ordinal || !summary.failed || !summary.total || Number(summary.failed) > Number(summary.total)) return null
  if (Number(ordinal) > Number(summary.total)) return null
  return `${block.path}#${ordinal}`
}

/**
 * Symbolic pgTAP/TAP classification for the whitelisted local `test db` stage.
 * Scans captured stdout plus stderr internally but only ever returns fixed
 * labels: infrastructure categories win, then a safely anchored TAP plan
 * mismatch, then a recognizable TAP test failure, else `unknown`. A bare
 * pgTAP `Result: FAIL` summary is not an attributable assertion and fails
 * closed to `unknown`. Original output, SQL and row values are never returned.
 */
export function safeTestDiagnostics(stdout: string, stderr: string, allowlistedTestPaths: ReadonlySet<string> = new Set()): string {
  const infrastructure = safeErrorCategories(stderr)
  if (infrastructure !== 'unknown') return infrastructure
  const output = `${stdout}\n${stderr}`
  const planMismatch = [
    /^#\s*looks like you planned \d+ tests? but ran \d+/im,
    /^#\s*planned \d+ tests? but ran \d+/im,
    /^#\s*bad plan\b[^\n]*\bplanned \d+ tests? but ran \d+/im,
  ].some(pattern => pattern.test(output))
  if (planMismatch) return 'tap_plan_mismatch'
  const testFailure = [
    TAP_FAILED_TEST_SIGNAL,
    TAP_SUBTEST_SUMMARY_SIGNAL,
    TAP_HARNESS_FAILURE_SIGNAL,
    /^#\s*looks like you failed \d+ tests? of \d+/im,
  ].some(pattern => pattern.test(output))
  if (!testFailure) return 'unknown'
  const provenance = attributedTapFailure(output, allowlistedTestPaths)
  return provenance ? `pg_tap_test_failure:${provenance}` : 'pg_tap_test_failure:unattributed'
}

/**
 * A per-file run has already fixed the only executable path. Its non-zero
 * exit is therefore sufficient file-level provenance, while hard
 * infrastructure categories still take precedence. Raw output is never
 * returned or persisted.
 */
export function safePerFileTestDiagnostics(
  stderr: string,
  invokedTestPath: string,
  allowlistedTestPaths: ReadonlySet<string>,
): string {
  if (!allowlistedTestPaths.has(invokedTestPath) ||
    !/^supabase\/tests\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(invokedTestPath) ||
    invokedTestPath.split('/').some(part => part === '.' || part === '..')) return 'unknown'
  const categories = safeErrorCategories(stderr)
  if (infrastructureCategory(categories)) return categories
  return `pg_tap_file_failure:${invokedTestPath}`
}

export function commandFailure(file: string, args: string[], error: unknown, allowlistedTestPaths: ReadonlySet<string> = new Set()): Error {
  const detail = error as { code?: unknown; stderr?: unknown; stdout?: unknown } | null
  const ownedCliStart = file === 'docker' && args.length === 9 && args[0] === '--host' &&
    /^unix:\/\/\//.test(args[1]) && args[2] === 'exec' && /^[a-f0-9]{64}$/.test(args[3]) &&
    args[4] === 'docker' && args[5] === '--host' && args[6] === 'unix:///var/run/docker.sock' &&
    args[7] === 'start' && /^[a-f0-9]{64}$/.test(args[8])
  if (ownedCliStart) {
    const code = typeof detail?.code === 'number' ? detail.code : 'unknown'
    const stderr = typeof detail?.stderr === 'string' ? detail.stderr.slice(0, 4096) : 'unavailable'
    return new Error(`DB validation command failed: owned CLI container start (exit ${code}); ${stderr}; no fallback performed`)
  }
  const cliIndex = args.indexOf('supabase')
  const stage = args.slice(cliIndex + 1).join(' ')
  const testDbStage = '--workdir /work test db --local supabase/tests'
  const testFileMatch = /^--workdir \/work test db --local (supabase\/tests\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+)$/.exec(stage)
  const testFileCandidate = testFileMatch?.[1]
  const testFilePath = testFileCandidate && !testFileCandidate.split('/').some(part => part === '.' || part === '..') && allowlistedTestPaths.has(testFileCandidate)
    ? testFileCandidate
    : undefined
  const fixedStage = ['--workdir /work db start', '--workdir /work db reset --local', testDbStage,
    '--workdir /work db lint --local --schema public --level warning --fail-on error'].includes(stage) || testFilePath !== undefined
  const ownedSupabase = file === 'docker' && args[0] === '--host' && /^unix:\/\/\//.test(args[1]) &&
    args[2] === 'exec' && /^[a-f0-9]{64}$/.test(args[3]) && args[4] === 'docker' &&
    args[5] === '--host' && args[6] === 'unix:///var/run/docker.sock' && args[7] === 'exec' &&
    args[8] === '--workdir' && args[9] === '/work' && /^[a-f0-9]{64}$/.test(args[10]) &&
    args[11] === 'env' && args[12] === '-i' && cliIndex > 12 && fixedStage
  if (ownedSupabase) {
    const code = typeof detail?.code === 'number' ? detail.code : 'unknown'
    const stderr = typeof detail?.stderr === 'string' ? detail.stderr : ''
    const diagnostics = stage === testDbStage
      ? safeTestDiagnostics(typeof detail?.stdout === 'string' ? detail.stdout : '', stderr, allowlistedTestPaths)
      : testFilePath
        ? safePerFileTestDiagnostics(stderr, testFilePath, allowlistedTestPaths)
        : safeErrorCategories(stderr)
    const diagnostic: DbValidationDiagnostic | undefined = stage === testDbStage
      ? { kind: 'test-suite', category: diagnostics, infrastructure: infrastructureCategory(diagnostics), exitCode: typeof code === 'number' ? code : null }
      : testFilePath
        ? { kind: 'test-file', category: diagnostics, infrastructure: infrastructureCategory(diagnostics), exitCode: typeof code === 'number' ? code : null, path: testFilePath }
        : undefined
    const message = `DB validation failed: supabase ${stage} (exit ${code}); ${diagnostics || 'unknown'}; no fallback performed`
    return diagnostic
      ? diagnosticError(message, diagnostic)
      : new Error(message)
  }
  // Never include unfiltered Supabase output, arbitrary Error.message, stdout or environment.
  return new Error(`DB validation command failed: ${file} ${args[0] ?? ''}; no fallback performed`)
}
