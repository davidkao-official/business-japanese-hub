import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { validateDatabase, IMAGE, CLI_IMAGE, CLI_VERSION, CLI_SHA256, DATA_ROOT } from './guard.ts'
import { commandFailure, safeErrorCategories } from './command-error.ts'

const token = 'a'.repeat(32)
const receipt = 'b'.repeat(64)
const cliReceipt = 'c'.repeat(64)
function harness() {
  const calls: string[][] = []
  let cancelled = false
  const row = {
    Id: receipt, Name: `/bjh-db-validation-${token}`,
    Config: { Image: IMAGE, Labels: { 'dev.business-japanese-hub.db-validation': token } },
    HostConfig: { Privileged: true, Binds: [], PortBindings: {}, PublishAllPorts: false, NetworkMode: 'default',
      Tmpfs: { '/var/lib/docker': '', '/certs/client': '', '/certs/server': '' } },
    Mounts: [] as { Type: string; Destination?: string }[], Path: 'dockerd',
    Args: ['--host=unix:///var/run/docker.sock', `--data-root=${DATA_ROOT}`, '--storage-driver=vfs'],
  }
  const cliRow = {
    Id: cliReceipt, Name: `/bjh-validation-cli-${token}`,
    Config: { Image: CLI_IMAGE, Labels: { 'dev.business-japanese-hub.db-validation': token }, Cmd: ['sleep', 'infinity'] },
    HostConfig: { NetworkMode: 'host', Privileged: false, PortBindings: {} },
    Mounts: [{ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock' }],
  }
  let override: (args: string[]) => string | void = () => undefined
  const options = {
    endpoint: 'unix:///var/run/docker.sock', token, source: '/tmp/exclusive-inputs',
    cancelled: () => cancelled, report: () => {},
    run: async (command: string[]) => {
      assert.deepEqual(command.slice(0, 2), ['--host', options.endpoint])
      const args = command.slice(2)
      calls.push(args)
      const response = override(args)
      if (response !== undefined) return response
      if (args[0] === 'info') return 'outer-daemon'
      if (args[0] === 'ps') return ''
      if (args[0] === 'create') return receipt
      if (args[0] === 'inspect') return JSON.stringify([row])
      if (args[0] === 'exec' && args.includes('{{.DockerRootDir}}')) return DATA_ROOT
      if (args[0] === 'exec' && args.includes('info') && args.includes('--format')) return 'inner-daemon'
      if (args[0] === 'exec' && args[2] === 'docker' && args.includes('create')) return cliReceipt
      if (args[0] === 'exec' && args.includes('-aq') && calls.some(a => a[0] === 'exec' && a.includes('create'))) return cliReceipt
      if (args[0] === 'exec' && args.includes('container') && args.includes('inspect')) return JSON.stringify([cliRow])
      if (args[0] === 'exec' && args.includes('supabase') && args.includes('--version')) return CLI_VERSION
      return ''
    },
  }
  return { options, calls, row, cliRow, override: (fn: typeof override) => { override = fn }, cancel: () => { cancelled = true } }
}
const destructive = (calls: string[][]) => calls.filter(a => ['create', 'start', 'rm', 'cp', 'exec'].includes(a[0]))

test('fixed gates run only in the receipt container, with isolated env and checksum-pinned CLI', async () => {
  const h = harness()
  await validateDatabase(h.options)
  const executions = h.calls.filter(a => a[0] === 'exec')
  assert.ok(executions.every(a => a[1] === receipt))
  const gates = executions.filter(a => a.includes('supabase') && !a.includes('--version'))
  assert.equal(gates.length, 4)
  assert.ok(gates.every(a => a.includes('-i') && a.includes('DOCKER_HOST=unix:///var/run/docker.sock')))
  assert.ok(gates.some(a => a.includes('reset') && a.includes('--local')))
  assert.ok(!h.calls.flat().some(a => ['--linked', '--db-url', 'stop', 'prune', '--volume', '-v'].includes(a)))
  assert.ok(executions.some(a => a.some(v => v.includes(CLI_SHA256) && v.includes(CLI_VERSION))))
  assert.ok(gates.every(a => a.includes(cliReceipt)))
  assert.ok(executions.some(a => a.includes('/usr/local/bin/docker') && a.includes(`${cliReceipt}:/usr/local/bin/docker`)))
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})

for (const endpoint of ['tcp://127.0.0.1:2375', 'ssh://server', '', 'unix://relative', 'unix:///socket\n']) {
  test(`rejects unsupported endpoint ${JSON.stringify(endpoint)} before mutation`, async () => {
    const h = harness(); h.options.endpoint = endpoint
    await assert.rejects(validateDatabase(h.options))
    assert.equal(destructive(h.calls).length, 0)
  })
}
test('pre-existing name is refused without adopting or relabeling it', async () => {
  const h = harness(); h.override(a => a[0] === 'ps' ? `bjh-db-validation-${token}` : undefined)
  await assert.rejects(validateDatabase(h.options), /pre-existing/)
  assert.equal(destructive(h.calls).length, 0)
})
test('failed inventory never becomes an empty inventory', async () => {
  const h = harness(); h.override(a => { if (a[0] === 'ps') throw new Error('inventory unavailable') })
  await assert.rejects(validateDatabase(h.options))
  assert.equal(destructive(h.calls).length, 0)
})
for (const result of ['name-only', '', `${receipt}\n${receipt}`]) {
  test(`invalid create receipt ${JSON.stringify(result)} never triggers name-based cleanup`, async () => {
    const h = harness(); h.override(a => a[0] === 'create' ? result : undefined)
    await assert.rejects(validateDatabase(h.options))
    assert.equal(h.calls.filter(a => a[0] === 'rm' || a[0] === 'start').length, 0)
  })
}
test('create failure, including a name collision race, never adopts or cleans up', async () => {
  const h = harness(); h.override(a => { if (a[0] === 'create') throw new Error('collision') })
  await assert.rejects(validateDatabase(h.options))
  assert.equal(h.calls.filter(a => a[0] === 'rm' || a[0] === 'start').length, 0)
})
for (const drift of ['label', 'mount', 'command', 'daemon', 'inspection']) {
  test(`ownership ${drift} drift preserves resources`, async () => {
    const h = harness()
    h.override(a => {
      if (!h.calls.some(c => c[0] === 'create')) return
      if (drift === 'label') h.row.Config.Labels['dev.business-japanese-hub.db-validation'] = 'other'
      if (drift === 'mount') h.row.Mounts = [{ Type: 'volume' }]
      if (drift === 'command') h.row.Args = ['--host=tcp://0.0.0.0:2375']
      if (drift === 'daemon' && a[0] === 'info') return 'different-daemon'
      if (drift === 'inspection' && a[0] === 'inspect') throw new Error('inspect failed')
    })
    await assert.rejects(validateDatabase(h.options))
    assert.equal(h.calls.filter(a => a[0] === 'rm' || a[0] === 'start').length, 0)
  })
}
test('partial start failure cleans only the create receipt', async () => {
  const h = harness(); h.override(a => { if (a[0] === 'start') throw new Error('start failed') })
  await assert.rejects(validateDatabase(h.options))
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})
test('interruption before create causes no mutation', async () => {
  const h = harness(); h.cancel()
  await assert.rejects(validateDatabase(h.options), /interrupted/)
  assert.equal(destructive(h.calls).length, 0)
})
test('interruption after create prevents start and cleans only owned receipt', async () => {
  const h = harness(); h.override(a => { if (a[0] === 'create') h.cancel() })
  await assert.rejects(validateDatabase(h.options), /interrupted/)
  assert.equal(h.calls.filter(a => a[0] === 'start').length, 0)
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})
test('inner daemon aliasing the outer daemon is refused before reset', async () => {
  const h = harness(); h.override(a => a[0] === 'exec' && a.includes('--format') && a.includes('info') ? 'outer-daemon' : undefined)
  await assert.rejects(validateDatabase(h.options), /not distinct/)
  assert.ok(!h.calls.flat().includes('reset'))
})
test('pre-existing inner data is preserved without reset or cleanup', async () => {
  const h = harness(); h.override(a => a[0] === 'exec' && a.includes('-aq') ? 'unknown-container' : undefined)
  await assert.rejects(validateDatabase(h.options), /pre-existing/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('unknown resources appearing between gates stop further mutation and cleanup', async () => {
  const h = harness()
  h.override(a => {
    if (!h.calls.some(c => c.includes('supabase') && c.includes('start'))) return
    if (a[0] === 'exec' && a.includes('-aq')) return 'unknown-container'
    if (a[0] === 'exec' && a.includes('container') && a.includes('inspect')) return JSON.stringify([{ Config: { Labels: {} } }])
  })
  await assert.rejects(validateDatabase(h.options), /unknown nested/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('failed nested inventory stops reset and cleanup', async () => {
  const h = harness(); h.override(a => { if (a[0] === 'exec' && a.includes('network')) throw new Error('inventory unavailable') })
  await assert.rejects(validateDatabase(h.options))
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})

test('interruption during a gate still inventories nested resources before receipt cleanup', async () => {
  const h = harness()
  h.override(a => { if (a.includes('supabase') && a.includes('start')) h.cancel() })
  await assert.rejects(validateDatabase(h.options), /interrupted/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})
test('interruption plus unknown nested data preserves the domain', async () => {
  const h = harness()
  h.override(a => {
    if (a.includes('supabase') && a.includes('start')) h.cancel()
    if (!h.options.cancelled()) return
    if (a[0] === 'exec' && a.includes('-aq')) return 'unknown'
    if (a[0] === 'exec' && a.includes('container') && a.includes('inspect')) return '[{"Config":{"Labels":{}}}]'
  })
  await assert.rejects(validateDatabase(h.options))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('CLI rejects remote/linked arguments and target environment before invoking Docker', () => {
  for (const flag of ['--linked', '--db-url', '--workdir', '--local']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/validate-db.ts', flag], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /no arguments/)
  }
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_WORKDIR', 'DATABASE_URL']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/validate-db.ts'], {
      encoding: 'utf8', env: { PATH: process.env.PATH, [key]: 'rejected-test-value' },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`unset ${key}`))
    assert.ok(!result.stderr.includes('rejected-test-value'))
  }
})

test('inner daemon drift between gates preserves the container', async () => {
  const h = harness()
  h.override(a => h.calls.some(c => c.includes('supabase') && c.includes('start')) &&
    a[0] === 'exec' && a.includes('info') && a.includes('--format') ? 'changed-inner-daemon' : undefined)
  await assert.rejects(validateDatabase(h.options), /inner daemon identity changed/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('pre-existing non-default nested network is refused and preserved', async () => {
  const h = harness()
  h.override(a => {
    if (a[0] === 'exec' && a.includes('network') && a.includes('ls')) return 'foreign-network'
    if (a[0] === 'exec' && a.includes('network') && a.includes('inspect')) return '[{"Name":"foreign","Labels":{}}]'
  })
  await assert.rejects(validateDatabase(h.options), /unknown nested/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('readiness failure only removes the proved receipt', async () => {
  const h = harness()
  h.override(a => { if (a[0] === 'exec' && a.some(v => v.includes('until docker'))) throw new Error('not ready') })
  await assert.rejects(validateDatabase(h.options), /not ready/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})
for (const stage of ['info', 'ps', 'volume', 'signal']) {
  test(`initial ${stage} inventory interruption preserves resources once daemon is ready`, async () => {
    const h = harness()
    h.override(a => {
      if (stage === 'signal' && a[0] === 'exec' && a.some(v => v.includes('until docker'))) h.cancel()
      if (a[0] !== 'exec' || a[2] !== 'docker') return
      if ((stage === 'info' && a.includes('info')) || (stage === 'ps' && a.includes('-aq')) ||
        (stage === 'volume' && a.includes('volume'))) throw new Error('initial inventory failed')
    })
    await assert.rejects(validateDatabase(h.options))
    assert.ok(!h.calls.flat().includes('reset'))
    assert.ok(!h.calls.some(a => a[0] === 'rm'))
  })
}
test('missing CLI create receipt is never adopted by name', async () => {
  const h = harness(); h.override(a => a[0] === 'exec' && a.includes('create') ? '' : undefined)
  await assert.rejects(validateDatabase(h.options), /invalid CLI create receipt/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('CLI socket drift refuses execution and preserves the domain', async () => {
  const h = harness(); h.cliRow.Mounts[0].Source = '/other/docker.sock'
  await assert.rejects(validateDatabase(h.options), /CLI socket/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('CLI image drift refuses execution and preserves the domain', async () => {
  const h = harness(); h.cliRow.Config.Image = 'unowned/image'
  await assert.rejects(validateDatabase(h.options), /CLI ownership/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('CLI create error with a lost receipt preserves the unknown container', async () => {
  const h = harness()
  h.override(a => { if (a[0] === 'exec' && a.includes('create')) throw new Error('lost create reply') })
  await assert.rejects(validateDatabase(h.options), /lost create reply/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
for (const stage of ['start', 'exec']) {
  test(`CLI ${stage} failure cleans only the proved outer receipt`, async () => {
    const h = harness()
    h.override(a => {
      if (a[0] === 'exec' && a.includes(cliReceipt) &&
        ((stage === 'start' && a.includes('start')) || (stage === 'exec' && a.includes('mkdir')))) {
        throw new Error(`CLI ${stage} failed`)
      }
    })
    await assert.rejects(validateDatabase(h.options), new RegExp(`CLI ${stage} failed`))
    assert.ok(!h.calls.flat().includes('reset'))
    assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
  })
}
test('bounded diagnostics apply only to the fixed pre-DB CLI start command', () => {
  const args = ['--host', 'unix:///outer.sock', 'exec', receipt, 'docker', '--host',
    'unix:///var/run/docker.sock', 'start', cliReceipt]
  const result = commandFailure('docker', args, { code: 1, stderr: 'mount failed: read-only file system' })
  assert.match(result.message, /owned CLI container start \(exit 1\); mount failed: read-only file system/)
  const bounded = commandFailure('docker', args, { stderr: 'x'.repeat(6000) })
  assert.ok(bounded.message.length < 4300)
  for (const rejectedArgs of [
    [...args, 'extra'], [...args.slice(0, 7), 'exec', cliReceipt, 'supabase', 'db', 'start'],
    ['--host', 'unix:///outer.sock', 'exec', receipt, 'supabase', 'db', 'start'],
  ]) {
    const suppressed = commandFailure('docker', rejectedArgs, { stderr: 'PRIVATE-OUTPUT', stdout: 'PRIVATE-OUTPUT', message: 'PRIVATE-OUTPUT' })
    assert.ok(!suppressed.message.includes('PRIVATE-OUTPUT'))
  }
})
test('unexpected actual daemon data root preserves the unknown domain', async () => {
  const h = harness()
  h.override(a => a[0] === 'exec' && a.includes('{{.DockerRootDir}}') ? '/foreign-data' : undefined)
  await assert.rejects(validateDatabase(h.options), /inner daemon data root changed/)
  assert.ok(!h.calls.flat().includes('reset'))
  assert.ok(!h.calls.some(a => a[0] === 'rm'))
})
test('a mount over the owned writable data path refuses start and cleanup', async () => {
  const h = harness(); h.row.Mounts.push({ Type: 'tmpfs', Destination: DATA_ROOT })
  await assert.rejects(validateDatabase(h.options), /unexpected mount/)
  assert.ok(!h.calls.some(a => a[0] === 'start' || a[0] === 'rm'))
})
test('additional ancestor tmpfs declaration cannot mask the owned data root', async () => {
  const h = harness()
  ;(h.row.HostConfig.Tmpfs as Record<string, string>)['/'] = ''
  await assert.rejects(validateDatabase(h.options), /unexpected disposable filesystem declaration/)
  assert.ok(!h.calls.some(a => a[0] === 'start' || a[0] === 'rm'))
})
test('Supabase diagnostics expose fixed categories without any original error text', () => {
  const lines = safeErrorCategories([
    'ordinary startup output not included', 'Error: no space left on device',
    'Error: password=PRIVATE-PASSWORD', 'Error: Authorization: Bearer PRIVATE-BEARER',
    'Error: connection to postgres://user:PRIVATE-PASSWORD@example.invalid/db refused',
    'Error: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature',
    `Error: ${'q'.repeat(50)}`, 'Error: api_key=PRIVATE-KEY',
    'ERROR: alice@example.invalid short-value',
  ].join('\n'))
  assert.equal(lines, 'disk_full')
  for (const value of ['ordinary startup', 'PRIVATE-', 'eyJ', 'q'.repeat(50), 'example.invalid']) assert.ok(!lines.includes(value))
})
test('fixed owned Supabase stage receives only categories and numeric exit', () => {
  const args = ['--host', 'unix:///outer.sock', 'exec', receipt, 'docker', '--host',
    'unix:///var/run/docker.sock', 'exec', '--workdir', '/work', cliReceipt,
    'env', '-i', 'PATH=/usr/local/bin', 'supabase', '--workdir', '/work', 'db', 'start']
  const result = commandFailure('docker', args, { code: 1, stderr: 'Error: no space left on device\nError: token=PRIVATE', stdout: 'PRIVATE' })
  assert.match(result.message, /supabase --workdir \/work db start \(exit 1\)/)
  assert.match(result.message, /disk_full/)
  assert.ok(!result.message.includes('PRIVATE'))
  const arbitrary = commandFailure('docker', [...args, '--linked'], { stderr: 'Error: PRIVATE' })
  assert.ok(!arbitrary.message.includes('PRIVATE'))
})
