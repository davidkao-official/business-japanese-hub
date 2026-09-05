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

export function commandFailure(file: string, args: string[], error: unknown): Error {
  const detail = error as { code?: unknown; stderr?: unknown } | null
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
  const fixedStage = ['--workdir /work db start', '--workdir /work db reset --local',
    '--workdir /work test db --local supabase/tests',
    '--workdir /work db lint --local --schema public --level warning --fail-on error'].includes(stage)
  const ownedSupabase = file === 'docker' && args[0] === '--host' && /^unix:\/\/\//.test(args[1]) &&
    args[2] === 'exec' && /^[a-f0-9]{64}$/.test(args[3]) && args[4] === 'docker' &&
    args[5] === '--host' && args[6] === 'unix:///var/run/docker.sock' && args[7] === 'exec' &&
    args[8] === '--workdir' && args[9] === '/work' && /^[a-f0-9]{64}$/.test(args[10]) &&
    args[11] === 'env' && args[12] === '-i' && cliIndex > 12 && fixedStage
  if (ownedSupabase) {
    const code = typeof detail?.code === 'number' ? detail.code : 'unknown'
    const lines = typeof detail?.stderr === 'string' ? safeErrorCategories(detail.stderr) : ''
    return new Error(`DB validation failed: supabase ${stage} (exit ${code}); ${lines || 'unknown'}; no fallback performed`)
  }
  // Never include unfiltered Supabase output, arbitrary Error.message, stdout or environment.
  return new Error(`DB validation command failed: ${file} ${args[0] ?? ''}; no fallback performed`)
}
