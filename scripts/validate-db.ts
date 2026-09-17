import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateDatabase, validationProjectId } from './db-validation/guard.ts'
import { commandFailure } from './db-validation/command-error.ts'
import { committedTestPaths as testPathsFromEntries, parseCommittedDbTree } from './db-validation/source.ts'

const execute = promisify(execFile)
const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME }
let committedTestPaths: ReadonlySet<string> = new Set()
// No caller-selected project, workdir, linked target, URL or CLI arguments.
if (process.argv.length !== 2) throw new Error('Usage: pnpm validate:db (no arguments)')
for (const key of Object.keys(process.env)) {
  if (/^(DOCKER_|SUPABASE_|PGHOST$|PGPORT$|PGDATABASE$|PGPASSWORD$|DATABASE_URL$)/.test(key)) {
    throw new Error(`DB validation refused: unset ${key}; no target/environment overrides are accepted`)
  }
}
const command = async (file: string, args: string[]) => {
  try {
    return (await execute(file, args, { env: safeEnv, maxBuffer: 16 * 1024 * 1024, timeout: 900_000 })).stdout
  } catch (error) {
    // Do not dump subprocess environment or potentially sensitive command output.
    throw commandFailure(file, args, error, committedTestPaths)
  }
}
const context = (await command('docker', ['context', 'show'])).trim()
const contexts = JSON.parse(await command('docker', ['context', 'inspect', context]))
if (!Array.isArray(contexts) || contexts.length !== 1) throw new Error('Ambiguous Docker context')
const endpoint = contexts[0]?.Endpoints?.docker?.Host
if (typeof endpoint !== 'string') throw new Error('Missing Docker endpoint')
await command('git', ['diff', '--exit-code', 'HEAD', '--', 'supabase/config.toml', 'supabase/migrations', 'supabase/tests'])
const head = (await command('git', ['rev-parse', 'HEAD'])).trim()
const token = randomBytes(16).toString('hex')
const source = await mkdtemp(join(tmpdir(), 'bjh-db-validation-'))
let interrupted = false
const interrupt = () => { interrupted = true }
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
try {
  // Only committed regular files; never copy .temp/.branches, .env, backups or user data.
  const tree = await command('git', ['ls-tree', '-r', head, '--', 'supabase/config.toml', 'supabase/migrations', 'supabase/tests'])
  const entries = parseCommittedDbTree(tree)
  for (const { path } of entries) {
    let data = await command('git', ['show', `${head}:${path}`])
    if (path === 'supabase/config.toml') {
      if (!/^project_id = "[\w-]+"$/m.test(data)) throw new Error('Unrecognized project config')
      data = data.replace(/^project_id = "[\w-]+"$/m, `project_id = "${validationProjectId(token)}"`)
    }
    await mkdir(dirname(join(source, path)), { recursive: true })
    await writeFile(join(source, path), data, { mode: 0o600 })
  }
  committedTestPaths = new Set(testPathsFromEntries(entries))
  console.log(`DB validation input HEAD: ${head}`)
  await validateDatabase({
    endpoint, token, source, cancelled: () => interrupted,
    testPaths: [...committedTestPaths].sort(),
    run: args => command('docker', args), report: message => console.log(message),
  })
  if (interrupted) throw new Error('DB validation interrupted')
} finally {
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', interrupt)
  // Only the exclusive mkdtemp source snapshot; never a worktree or Docker volume.
  await rm(source, { recursive: true, force: true })
}
