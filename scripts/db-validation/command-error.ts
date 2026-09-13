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

const TAP_ASSERTION_ORDINAL_MAX = 1_000_000
const TAP_PATH = 'supabase/tests/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+'
const TAP_HARNESS_PREFIX = new RegExp(`^\\s*(${TAP_PATH})\\s+\\.\\.`, 'i')
const TAP_HARNESS_FAILURE = new RegExp(`^\\s*(${TAP_PATH})\\s+\\.\\.\\s+Failed\\s+([0-9]+)\\/([0-9]+)\\s+subtests\\s*$`, 'i')
const TAP_NOT_OK = /^\s*not\s+ok(?:\s+([0-9]+)\b)?(?:[ \t].*)?$/i
const TAP_NOT_OK_PREFIX = /^\s*not\s+ok\b/i
const TAP_FAILED_TEST = /^\s*#\s*Failed test(?:\s+([0-9]+))?:\s*/i
const TAP_FAILED_TEST_PREFIX = /^\s*#\s*Failed test\b/i
const TAP_POSITION = new RegExp(`^\\s*#\\s*at\\s+\\/work\\/(${TAP_PATH})\\s+line\\s+([0-9]+)\\s*$`, 'i')
const TAP_POSITION_PREFIX = /^\s*#\s*at\b/i

function tapOrdinal(value: string): string | null {
  if (!/^[1-9][0-9]{0,6}$/.test(value)) return null
  const ordinal = Number(value)
  return ordinal <= TAP_ASSERTION_ORDINAL_MAX ? String(ordinal) : null
}

function attributedTapFailure(output: string, allowlistedTestPaths: ReadonlySet<string>): string | null {
  let harnessRecordCount = 0
  let harnessPath: string | undefined
  let notOkCount = 0
  let notOkOrdinal: string | null = null
  let failedTestCount = 0
  let failedTestOrdinal: string | null = null
  let positionCount = 0
  let positionPath: string | undefined
  let positionPhysicalLine: string | null = null
  let pendingOrdinal: string | null | undefined
  let malformed = false
  for (const line of output.split(/\r?\n/)) {
    if (pendingOrdinal !== undefined) {
      const position = TAP_POSITION.exec(line)
      if (position) {
        positionCount += 1
        if (positionCount > 1) malformed = true
        positionPath = position[1]
        positionPhysicalLine = tapOrdinal(position[2])
        if (!positionPhysicalLine) malformed = true
        pendingOrdinal = undefined
        continue
      }
      malformed = true
      pendingOrdinal = undefined
    }

    const harnessRecord = TAP_HARNESS_PREFIX.exec(line)
    if (harnessRecord) {
      harnessRecordCount += 1
      if (harnessRecordCount > 1) malformed = true
      const failure = TAP_HARNESS_FAILURE.exec(line)
      if (!failure) {
        malformed = true
      } else {
        harnessPath = failure[1]
        const failedSubtests = tapOrdinal(failure[2])
        const totalSubtests = tapOrdinal(failure[3])
        if (!failedSubtests || !totalSubtests || Number(failedSubtests) > Number(totalSubtests)) {
          malformed = true
        }
      }
      continue
    }

    if (TAP_NOT_OK_PREFIX.test(line)) {
      notOkCount += 1
      if (notOkCount > 1 || harnessRecordCount === 0) malformed = true
      const notOk = TAP_NOT_OK.exec(line)
      const ordinal = tapOrdinal(notOk?.[1] ?? '')
      if (!ordinal || notOkOrdinal) malformed = true
      else notOkOrdinal = ordinal
      continue
    }

    const failedTest = TAP_FAILED_TEST.exec(line)
    if (failedTest) {
      failedTestCount += 1
      if (failedTestCount > 1 || harnessRecordCount === 0) malformed = true
      const ordinal = tapOrdinal(failedTest[1] ?? '')
      if (!ordinal || failedTestOrdinal) malformed = true
      else failedTestOrdinal = ordinal
      pendingOrdinal = ordinal
      continue
    }
    if (TAP_FAILED_TEST_PREFIX.test(line)) {
      failedTestCount += 1
      malformed = true
      continue
    }

    if (TAP_POSITION_PREFIX.test(line)) malformed = true
  }
  if (pendingOrdinal !== undefined) malformed = true
  if (harnessRecordCount !== 1 || notOkCount !== 1 || failedTestCount !== 1 || positionCount !== 1 || malformed) return null
  if (!harnessPath || !allowlistedTestPaths.has(harnessPath) || !positionPath || positionPath !== harnessPath) return null
  if (!notOkOrdinal || !failedTestOrdinal || notOkOrdinal !== failedTestOrdinal) return null
  return notOkOrdinal === failedTestOrdinal ? `${harnessPath}#${notOkOrdinal}` : null
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
    /^\s*not ok\b/im,
    /^#\s*failed test\b/im,
    /^#\s*looks like you failed \d+ tests? of \d+/im,
    /\bFailed \d+\/\d+ subtests\b/,
  ].some(pattern => pattern.test(output))
  if (!testFailure) return 'unknown'
  const provenance = attributedTapFailure(output, allowlistedTestPaths)
  return provenance ? `pg_tap_test_failure:${provenance}` : 'pg_tap_test_failure:unattributed'
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
  const fixedStage = ['--workdir /work db start', '--workdir /work db reset --local', testDbStage,
    '--workdir /work db lint --local --schema public --level warning --fail-on error'].includes(stage)
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
      : safeErrorCategories(stderr)
    return new Error(`DB validation failed: supabase ${stage} (exit ${code}); ${diagnostics || 'unknown'}; no fallback performed`)
  }
  // Never include unfiltered Supabase output, arbitrary Error.message, stdout or environment.
  return new Error(`DB validation command failed: ${file} ${args[0] ?? ''}; no fallback performed`)
}
