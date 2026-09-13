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
const TAP_INLINE_FAILURE = new RegExp(`^\\s*(${TAP_PATH})\\s+(?:\\.\\.\\s*)?not\\s+ok\\s+([0-9]+)\\b`, 'i')
const TAP_PATH_HEADER = new RegExp(`^\\s*(${TAP_PATH})(?:\\s+\\.\\.)?\\s*$`, 'i')
const TAP_FAILURE = /^\s*not\s+ok\b/i

function tapOrdinal(value: string): string | null {
  if (!/^[1-9][0-9]{0,6}$/.test(value)) return null
  const ordinal = Number(value)
  return ordinal <= TAP_ASSERTION_ORDINAL_MAX ? String(ordinal) : null
}

function attributedTapFailure(output: string, allowlistedTestPaths: ReadonlySet<string>): string | null {
  const candidates = new Set<string>()
  let pendingPath: string | undefined
  let hasUnassociatedFailure = false
  for (const line of output.split(/\r?\n/)) {
    const inline = TAP_INLINE_FAILURE.exec(line)
    if (inline) {
      const ordinal = tapOrdinal(inline[2])
      if (ordinal && allowlistedTestPaths.has(inline[1])) candidates.add(`${inline[1]}#${ordinal}`)
      else hasUnassociatedFailure = true
      pendingPath = undefined
      continue
    }
    const header = TAP_PATH_HEADER.exec(line)
    if (header) {
      pendingPath = allowlistedTestPaths.has(header[1]) ? header[1] : undefined
      continue
    }
    if (TAP_FAILURE.test(line)) {
      const ordinal = tapOrdinal(/^\s*not\s+ok\s+([0-9]+)/i.exec(line)?.[1] ?? '')
      if (pendingPath && ordinal) candidates.add(`${pendingPath}#${ordinal}`)
      else hasUnassociatedFailure = true
      pendingPath = undefined
      continue
    }
    if (line.trim()) pendingPath = undefined
  }
  return !hasUnassociatedFailure && candidates.size === 1 ? [...candidates][0] : null
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
