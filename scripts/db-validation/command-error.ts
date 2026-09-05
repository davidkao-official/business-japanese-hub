/** Only this pre-DB, fixed lifecycle command can expose bounded runtime diagnostics. */
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
  // Never include a Supabase command's output, arbitrary Error.message, stdout or environment.
  return new Error(`DB validation command failed: ${file} ${args[0] ?? ''}; no fallback performed`)
}
