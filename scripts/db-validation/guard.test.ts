import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { validateDatabase, validationProjectId, IMAGE, CLI_IMAGE, CLI_VERSION, CLI_SHA256, DATA_ROOT } from './guard.ts'
import { commandFailure, safeErrorCategories, safePerFileTestDiagnostics, safeTestDiagnostics } from './command-error.ts'
import { committedTestPaths, parseCommittedDbTree } from './source.ts'

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
    endpoint: 'unix:///var/run/docker.sock', token, source: '/tmp/exclusive-inputs', testPaths: [] as string[],
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
const cliStage = (args: string[]) => {
  const index = args.indexOf('supabase')
  return index < 0 ? undefined : args.slice(index + 1).join(' ')
}
const testFileFromStage = (stage: string | undefined) =>
  /^--workdir \/work test db --local (supabase\/tests\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+)$/.exec(stage ?? '')?.[1]

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
  assert.equal(h.calls.map(a => testFileFromStage(cliStage(a))).filter(Boolean).length, 0)
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})

test('file isolation attributes one failing committed test without changing the red gate', async () => {
  const h = harness()
  const first = 'supabase/tests/entitlement_rls.test.sql'
  const second = 'supabase/tests/finance_status_counts.test.sql'
  h.options.testPaths = [second, first]
  h.override(a => {
    const stage = cliStage(a)
    if (stage === '--workdir /work test db --local supabase/tests') {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: 'PRIVATE-SUITE-STDOUT', stderr: 'SQLSTATE 23505 PRIVATE-SUITE-STDERR' }, new Set([first, second]))
    }
    if (stage === `--workdir /work test db --local ${first}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: 'PRIVATE-FILE-STDOUT', stderr: 'SQLSTATE 23505 PRIVATE-FILE-STDERR' }, new Set([first, second]))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.match(failure.message, /pg_tap_file_failure:supabase\/tests\/entitlement_rls\.test\.sql/)
  for (const leak of ['PRIVATE-SUITE', 'PRIVATE-FILE', '23505', 'SQLSTATE']) assert.ok(!failure.message.includes(leak))
  const paths = h.calls.map(a => testFileFromStage(cliStage(a))).filter(Boolean)
  assert.deepEqual(paths, [first, second])
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})

test('full-suite tap plan mismatch remains terminal and does not run file isolation', async () => {
  const h = harness()
  h.options.testPaths = ['supabase/tests/entitlement_rls.test.sql']
  h.override(a => {
    if (cliStage(a) === '--workdir /work test db --local supabase/tests') {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a], {
        code: 1,
        stdout: ['1..3', 'ok 1 - a', 'ok 2 - b', '# Looks like you planned 3 tests but ran 5.'].join('\n'),
        stderr: '',
      }, new Set(h.options.testPaths!))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.match(failure.message, /tap_plan_mismatch/)
  assert.ok(!failure.message.includes('pg_tap_file_failure:'))
  assert.ok(!failure.message.includes('Looks like you planned'))
  assert.ok(!h.calls.some(a => testFileFromStage(cliStage(a))))
})

test('multiple failing committed tests fail closed to unattributed file provenance', async () => {
  const h = harness()
  const first = 'supabase/tests/entitlement_rls.test.sql'
  const second = 'supabase/tests/finance_status_counts.test.sql'
  h.options.testPaths = [first, second]
  h.override(a => {
    const stage = cliStage(a)
    if (stage === '--workdir /work test db --local supabase/tests' ||
      stage === `--workdir /work test db --local ${first}` ||
      stage === `--workdir /work test db --local ${second}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: 'PRIVATE', stderr: 'SQLSTATE 23505 PRIVATE' }, new Set([first, second]))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.match(failure.message, /pg_tap_file_failure:unattributed/)
  assert.ok(!failure.message.includes(first) && !failure.message.includes(second))
})

test('infrastructure failure takes precedence over per-file isolation', async () => {
  const h = harness()
  h.options.testPaths = ['supabase/tests/entitlement_rls.test.sql']
  h.override(a => {
    if (cliStage(a) === '--workdir /work test db --local supabase/tests') {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: 'not ok 1 - PRIVATE', stderr: 'no space left on device' }, new Set(h.options.testPaths!))
    }
  })
  await assert.rejects(validateDatabase(h.options), /disk_full/)
  assert.ok(!h.calls.some(a => testFileFromStage(cliStage(a))))
})

test('infrastructure failure during file isolation stops attribution and preserves the primary category', async () => {
  const h = harness()
  const first = 'supabase/tests/entitlement_rls.test.sql'
  const second = 'supabase/tests/finance_status_counts.test.sql'
  h.options.testPaths = [first, second]
  h.override(a => {
    const stage = cliStage(a)
    if (stage === '--workdir /work test db --local supabase/tests') {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: '', stderr: 'SQLSTATE 23505' }, new Set([first, second]))
    }
    if (stage === `--workdir /work test db --local ${first}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: '', stderr: 'no space left on device' }, new Set([first, second]))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.match(failure.message, /disk_full/)
  assert.ok(!failure.message.includes('pg_tap_file_failure:'))
  const paths = h.calls.map(a => testFileFromStage(cliStage(a))).filter(Boolean)
  assert.deepEqual(paths, [first])
})

test('malformed per-file result fails closed without path attribution', async () => {
  const h = harness()
  const path = 'supabase/tests/entitlement_rls.test.sql'
  h.options.testPaths = [path]
  h.override(a => {
    const stage = cliStage(a)
    if (stage === '--workdir /work test db --local supabase/tests' || stage === `--workdir /work test db --local ${path}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { stderr: 'PRIVATE' }, new Set([path]))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.match(failure.message, /pg_tap_file_failure:unattributed/)
  assert.ok(!failure.message.includes(path))
})

test('uncommitted or malformed test paths are refused before any Docker mutation', async () => {
  for (const paths of [
    ['supabase/tests/../secret.sql'],
    ['supabase/tests/.'],
    ['/tmp/secret.sql'],
    ['supabase/tests/entitlement_rls.test.sql', 'supabase/tests/entitlement_rls.test.sql'],
    Array.from({ length: 65 }, (_, index) => `supabase/tests/generated-${index}.test.sql`),
  ]) {
    const h = harness()
    h.options.testPaths = paths
    await assert.rejects(validateDatabase(h.options))
    assert.deepEqual(h.calls, [])
  }
})

test('committed DB source parsing admits only regular tracked test blobs', () => {
  const first = 'supabase/tests/entitlement_rls.test.sql'
  const second = 'supabase/tests/finance_status_counts.test.sql'
  const entries = parseCommittedDbTree([
    `100644 blob ${'a'.repeat(40)}\tsupabase/config.toml`,
    `100644 blob ${'b'.repeat(40)}\tsupabase/migrations/20260901000000_example.sql`,
    `100644 blob ${'c'.repeat(40)}\t${second}`,
    `100755 blob ${'d'.repeat(40)}\t${first}`,
  ].join('\n'))
  assert.deepEqual(committedTestPaths(entries), [first, second].sort())
  for (const invalid of [
    '',
    `120000 blob ${'a'.repeat(40)}\t${first}`,
    `040000 tree ${'a'.repeat(40)}\tsupabase/tests`,
    `100644 blob ${'a'.repeat(40)}\tsupabase/tests/../secret.sql`,
    `100644 blob ${'a'.repeat(40)}\tsupabase/tests/.`,
    `100644 blob ${'a'.repeat(40)}\tother/file.sql`,
  ]) {
    assert.throws(() => parseCommittedDbTree(invalid))
  }
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
const ownedStage = (stage: string[]) => ['--host', 'unix:///outer.sock', 'exec', receipt, 'docker', '--host',
  'unix:///var/run/docker.sock', 'exec', '--workdir', '/work', cliReceipt,
  'env', '-i', 'PATH=/usr/local/bin', 'supabase', '--workdir', '/work', ...stage]
const committedTestPath = 'supabase/tests/entitlement_rls.test.sql'
const committedOtherTestPath = 'supabase/tests/finance_status_counts.test.sql'
const ordinalEligibleTestPath = 'supabase/tests/practice_attempts.test.sql'
test('per-file command diagnostics require an allowlisted committed test path', () => {
  const allowlist = new Set([committedTestPath])
  const result = commandFailure('docker', ownedStage(['test', 'db', '--local', committedTestPath]),
    { code: 1, stdout: 'PRIVATE-STDOUT', stderr: 'SQLSTATE 23505 PRIVATE-STDERR' }, allowlist)
  assert.match(result.message, new RegExp(`pg_tap_file_failure:${committedTestPath}`))
  assert.ok(!result.message.includes('PRIVATE'))

  const rejected = commandFailure('docker', ownedStage(['test', 'db', '--local', committedOtherTestPath]),
    { code: 1, stdout: 'PRIVATE-STDOUT', stderr: 'SQLSTATE 23505 PRIVATE-STDERR' }, allowlist)
  assert.ok(!rejected.message.includes(committedOtherTestPath))
  assert.ok(!rejected.message.includes('PRIVATE'))
  assert.equal(safePerFileTestDiagnostics('', 'SQLSTATE 23505', committedOtherTestPath, allowlist), 'unknown')
})
test('per-file ordinal attribution is limited to the exact committed practice_attempts file', () => {
  const path = ordinalEligibleTestPath
  const allowlist = new Set([path])
  const output = [
    `${path} ..`,
    '# Failed test 13: PRIVATE-DESCRIPTION',
    'Failed 1/13 subtests',
  ].join('\n')
  assert.equal(safePerFileTestDiagnostics(output, '', path, allowlist), `pg_tap_test_failure:${path}#13`)
  assert.equal(safePerFileTestDiagnostics(output, '', committedTestPath, new Set([committedTestPath])),
    `pg_tap_file_failure:${committedTestPath}`)
  assert.equal(safePerFileTestDiagnostics(output, '', 'supabase/tests/uncommitted.test.sql', allowlist), 'unknown')

  const result = commandFailure('docker', ownedStage(['test', 'db', '--local', path]),
    { code: 1, stdout: output, stderr: 'PRIVATE-STDERR token=PRIVATE-TOKEN' }, allowlist)
  assert.ok(result.message.includes(`pg_tap_test_failure:${path}#13`))
  for (const leak of ['PRIVATE-DESCRIPTION', 'PRIVATE-STDERR', 'PRIVATE-TOKEN', 'Failed test', 'subtests', '..']) {
    assert.ok(!result.message.includes(leak))
  }
})
test('per-file ordinal attribution requires singular bounded evidence', () => {
  const path = ordinalEligibleTestPath
  const allowlist = new Set([path])
  const cases = [
    [`${path} ..`, '# Failed test 3: PRIVATE-A', '# Failed test 4: PRIVATE-B', 'Failed 1/13 subtests'],
    [`${path} ..`, '# Failed test 3: PRIVATE', 'Failed 1/13 subtests', 'Failed 1/13 subtests'],
    [`${path} ..`, '# Failed test 14: PRIVATE', 'Failed 1/13 subtests'],
    [`${path} ..`, '# Failed test 0: PRIVATE', 'Failed 1/13 subtests'],
    [`${path} ..`, '# Failed test 1000001: PRIVATE', 'Failed 1/13 subtests'],
    [`${path} ..`, '# Failed test 3: PRIVATE'],
    [`${path} ..`, '# Failed test 3: PRIVATE', 'Failed 1/x subtests'],
    [`${committedTestPath} ..`, '# Failed test 3: PRIVATE', 'Failed 1/13 subtests'],
  ]
  for (const output of cases) {
    assert.equal(safePerFileTestDiagnostics(output.join('\n'), '', path, allowlist), `pg_tap_file_failure:${path}`)
  }
})
test('per-file infrastructure precedence and tap plan mismatch remain terminal', () => {
  const path = ordinalEligibleTestPath
  const output = [
    `${path} ..`,
    '# Failed test 13: PRIVATE-DESCRIPTION',
    'Failed 1/13 subtests',
  ].join('\n')
  assert.equal(safePerFileTestDiagnostics(output, 'Error: no space left on device', path, new Set([path])), 'disk_full')
  const planMismatch = ['1..3', 'ok 1 - a', '# Looks like you planned 3 tests but ran 5.'].join('\n')
  assert.equal(safePerFileTestDiagnostics(planMismatch, '', path, new Set([path])), 'tap_plan_mismatch')
})
test('per-file tap plan mismatch outranks non-hard diagnostic categories', () => {
  const path = ordinalEligibleTestPath
  const allowlist = new Set([path])
  const planMismatch = ['1..3', 'ok 1 - a', '# Looks like you planned 3 tests but ran 5.'].join('\n')
  assert.equal(safeTestDiagnostics(planMismatch, 'SQLSTATE 23505', allowlist), 'tap_plan_mismatch')
  assert.equal(safePerFileTestDiagnostics(planMismatch, 'SQLSTATE 23505', path, allowlist), 'tap_plan_mismatch')
  assert.equal(safePerFileTestDiagnostics(planMismatch, 'Error: no space left on device', path, allowlist), 'disk_full')
})
test('single committed-file isolation can emit one bounded ordinal and stays red', async () => {
  const h = harness()
  const path = ordinalEligibleTestPath
  h.options.testPaths = [path]
  const stdout = [
    `${path} ..`,
    '# Failed test 13: PRIVATE-DESCRIPTION',
    'Failed 1/13 subtests',
  ].join('\n')
  h.override(a => {
    const stage = cliStage(a)
    if (stage === '--workdir /work test db --local supabase/tests') {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: '', stderr: 'SQLSTATE 23505' }, new Set(h.options.testPaths!))
    }
    if (stage === `--workdir /work test db --local ${path}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout, stderr: '' }, new Set(h.options.testPaths!))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.ok(failure.message.includes(`pg_tap_test_failure:${path}#13`))
  assert.ok(!failure.message.includes('PRIVATE-DESCRIPTION'))
  assert.ok(!failure.message.includes('Failed 1/13'))
  const paths = h.calls.map(a => testFileFromStage(cliStage(a))).filter(Boolean)
  assert.deepEqual(paths, [path])
})
test('per-file tap plan mismatch remains terminal and stops later isolation', async () => {
  const h = harness()
  const path = ordinalEligibleTestPath
  const later = 'supabase/tests/z_later.test.sql'
  h.options.testPaths = [path, later]
  h.override(a => {
    const stage = cliStage(a)
    if (stage === '--workdir /work test db --local supabase/tests') {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: '# Failed test 3: PRIVATE', stderr: '' }, new Set(h.options.testPaths!))
    }
    if (stage === `--workdir /work test db --local ${path}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a], {
        code: 1,
        stdout: ['1..3', 'ok 1 - a', '# Looks like you planned 3 tests but ran 5.'].join('\n'),
        stderr: '',
      }, new Set(h.options.testPaths!))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.match(failure.message, /tap_plan_mismatch/)
  assert.ok(!failure.message.includes('#'))
  assert.ok(!failure.message.includes('Looks like you planned'))
  const paths = h.calls.map(a => testFileFromStage(cliStage(a))).filter(Boolean)
  assert.deepEqual(paths, [path])
})
test('ordinal attribution cannot survive multiple failing committed files', async () => {
  const h = harness()
  const path = ordinalEligibleTestPath
  const other = committedOtherTestPath
  h.options.testPaths = [path, other]
  h.override(a => {
    const stage = cliStage(a)
    if (stage === '--workdir /work test db --local supabase/tests') {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: '', stderr: 'SQLSTATE 23505' }, new Set(h.options.testPaths!))
    }
    if (stage === `--workdir /work test db --local ${path}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a], {
        code: 1,
        stdout: [`${path} ..`, '# Failed test 13: PRIVATE-DESCRIPTION', 'Failed 1/13 subtests'].join('\n'),
        stderr: '',
      }, new Set(h.options.testPaths!))
    }
    if (stage === `--workdir /work test db --local ${other}`) {
      throw commandFailure('docker', ['--host', h.options.endpoint, ...a],
        { code: 1, stdout: 'PRIVATE-STDOUT', stderr: 'SQLSTATE 23505' }, new Set(h.options.testPaths!))
    }
  })
  const failure = await validateDatabase(h.options).then(
    () => assert.fail('expected the full-suite gate to fail'),
    error => error as Error,
  )
  assert.match(failure.message, /pg_tap_file_failure:unattributed/)
  assert.ok(!failure.message.includes(`#13`))
  assert.ok(!failure.message.includes('PRIVATE'))
})
test('whitelisted test stage reports stdout pgTAP failures symbolically without leaking output', () => {
  const stdout = [
    `${committedTestPath} ..`,
    '# Failed test 3: "rls denies anonymous read"',
    'Failed 1/3 subtests',
    '# password=PRIVATE-PASSWORD',
    'Result: FAIL',
  ].join('\n')
  const result = commandFailure('docker', ownedStage(['test', 'db', '--local', 'supabase/tests']),
    { code: 1, stdout, stderr: 'Error: PRIVATE-SECRET' }, new Set([committedTestPath]))
  assert.match(result.message, /supabase --workdir \/work test db --local supabase\/tests \(exit 1\)/)
  assert.match(result.message, /pg_tap_test_failure:supabase\/tests\/entitlement_rls\.test\.sql#3/)
  for (const leak of ['not ok', 'PRIVATE', 'rls denies', 'Failed test', 'Failed 1/3', 'Result: FAIL']) {
    assert.ok(!result.message.includes(leak))
  }
})
test('normal pg_prove block emits only committed path and ordinal', () => {
  const path = committedTestPath
  const output = [
    `${path} ..`,
    '# Failed test 3: PRIVATE-DESCRIPTION',
    'Failed 1/3 subtests',
  ].join('\n')
  assert.equal(safeTestDiagnostics(output, '', new Set([path])), `pg_tap_test_failure:${path}#3`)
})
test('real /work pg_prove header normalizes to the committed relative path', () => {
  const path = committedTestPath
  const output = [
    `/work/${path} ..`,
    '# Failed test 3: PRIVATE-DESCRIPTION',
    'Failed 1/3 subtests',
  ].join('\n')
  const result = commandFailure('docker', ownedStage(['test', 'db', '--local', 'supabase/tests']),
    { code: 1, stdout: output, stderr: '' }, new Set([path]))
  assert.match(result.message, new RegExp(`pg_tap_test_failure:${path}#3`))
  assert.ok(!result.message.includes(`/work/${path}`))
  for (const header of [`/tmp/${path} ..`, `/work2/${path} ..`, 'supabase/tests/uncommitted.test.sql ..']) {
    assert.equal(safeTestDiagnostics(output.replace(`/work/${path} ..`, header), '', new Set([path])),
      'pg_tap_test_failure:unattributed')
  }
})
test('failure assertion ordinal beyond harness total stays unattributed', () => {
  const output = [
    `${committedTestPath} ..`,
    '# Failed test 4: PRIVATE-DESCRIPTION',
    'Failed 1/3 subtests',
  ].join('\n')
  assert.equal(safeTestDiagnostics(output, '', new Set([committedTestPath])), 'pg_tap_test_failure:unattributed')
})
test('passing harness file records are ignored beside one valid failing block', () => {
  const output = [
    `${committedOtherTestPath} .. ok`,
    `${committedTestPath} .. ok`,
    `${committedTestPath} ..`,
    '# Failed test 3: PRIVATE-DESCRIPTION',
    'Failed 1/3 subtests',
    `${committedOtherTestPath} .. ok`,
  ].join('\n')
  assert.equal(safeTestDiagnostics(output, '', new Set([committedTestPath, committedOtherTestPath])),
    `pg_tap_test_failure:${committedTestPath}#3`)
})
test('passing header with failure evidence is unattributed', () => {
  const output = [
    `${committedTestPath} .. ok`,
    '# Failed test 3: PRIVATE-DESCRIPTION',
    'Failed 1/3 subtests',
  ].join('\n')
  assert.equal(safeTestDiagnostics(output, '', new Set([committedTestPath])), 'pg_tap_test_failure:unattributed')
})
test('malformed harness block makes a separate valid candidate unattributed', () => {
  const output = [
    `${committedTestPath} .. Failed x/y subtests`,
    `${committedOtherTestPath} ..`,
    '# Failed test 3: PRIVATE-DESCRIPTION',
    'Failed 1/3 subtests',
  ].join('\n')
  assert.equal(safeTestDiagnostics(output, '', new Set([committedOtherTestPath])), 'pg_tap_test_failure:unattributed')
})
test('failure diagnostics without a normal harness block are unattributed', () => {
  const output = [
    '# Failed test 3: PRIVATE-FAILED-DESCRIPTION',
    'Failed 1/3 subtests',
  ].join('\n')
  assert.equal(safeTestDiagnostics(output, '', new Set([committedTestPath])), 'pg_tap_test_failure:unattributed')
})
test('missing, ambiguous, malformed, mismatched, and out-of-range TAP provenance stays unattributed', () => {
  const path = committedTestPath
  const otherPath = committedOtherTestPath
  const allowlist = new Set([path, otherPath])
  const pair = (ordinal: string, testPath: string) => [
    `${testPath} ..`,
    `# Failed test ${ordinal}: PRIVATE-DESCRIPTION`,
    'Failed 1/3 subtests',
  ].join('\n')
  assert.equal(safeTestDiagnostics(pair('3', path).replace(`${path} ..\n`, ''), '', allowlist),
    'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(pair('3', path), '', new Set([otherPath])), 'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics([pair('3', path), pair('4', otherPath)].join('\n'), '', allowlist),
    'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics([pair('3', path), pair('3', otherPath)].join('\n'), '', allowlist),
    'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(`${path} .. Failed 0/3 subtests\n${pair('3', path).split('\n').slice(1).join('\n')}`, '', allowlist),
    'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(pair('0', path), '', new Set([path])), 'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(pair('1000001', path), '', new Set([path])), 'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(pair('3', 'supabase/tests/uncommitted.test.sql'), '', new Set([path])),
    'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(`${path} ..\n# Failed test 3: PRIVATE-DESCRIPTION\n${otherPath} ..\nFailed 1/3 subtests`, '', allowlist),
    'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(`${path} ..\n# Failed test 3: PRIVATE-DESCRIPTION\nFailed 1/3 subtests\nFailed 1/3 subtests`, '', new Set([path])),
    'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics(`${path} ..\n# Failed test 3: PRIVATE-DESCRIPTION\nFailed 1/x subtests`, '', new Set([path])),
    'pg_tap_test_failure:unattributed')
})
test('whitelisted test stage recognizes a TAP plan/assertion-count mismatch symbolically', () => {
  const stdout = ['1..3', 'ok 1 - a', 'ok 2 - b', '# Looks like you planned 3 tests but ran 5.'].join('\n')
  const result = commandFailure('docker', ownedStage(['test', 'db', '--local', 'supabase/tests']), { code: 1, stdout, stderr: '' })
  assert.match(result.message, /tap_plan_mismatch/)
  for (const leak of ['Looks like you planned', 'planned 3 tests', '1..3']) assert.ok(!result.message.includes(leak))
})
test('test-stage diagnostics never include raw stdout, stderr, SQL or row values', () => {
  const stdout = '# Failed test 1: PRIVATE-TEST-BODY\n# SQLSTATE 23505 row id=1234 https://example.invalid/x token=PRIVATE-TOKEN'
  const result = commandFailure('docker', ownedStage(['test', 'db', '--local', 'supabase/tests']), { code: 2, stdout, stderr: 'PRIVATE-STDERR' })
  assert.match(result.message, /pg_tap_test_failure:unattributed/)
  for (const leak of ['PRIVATE-TEST-BODY', 'PRIVATE-STDERR', '23505', 'example.invalid', 'row id', 'SQL']) {
    assert.ok(!result.message.includes(leak))
  }
})
test('test stage preserves infrastructure categories over TAP output and stays unknown otherwise', () => {
  const args = ownedStage(['test', 'db', '--local', 'supabase/tests'])
  const infrastructure = commandFailure('docker', args, { code: 1, stdout: 'not ok 1 - x', stderr: 'Error: no space left on device' })
  assert.match(infrastructure.message, /disk_full/)
  assert.ok(!infrastructure.message.includes('not ok'))
  const unknown = commandFailure('docker', args, { code: 1, stdout: 'ordinary output PRIVATE', stderr: '' })
  assert.match(unknown.message, /; unknown;/)
  assert.ok(!unknown.message.includes('PRIVATE'))
})
test('bare pgTAP Result: FAIL summary fails closed to unknown without leakage', () => {
  const args = ownedStage(['test', 'db', '--local', 'supabase/tests'])
  const stdout = [
    'supabase/tests/assertions.test.sql .. ',
    'Result: FAIL',
    'PRIVATE-PASSWORD',
    'row email=alice@example.invalid id=1234',
  ].join('\n')
  assert.equal(safeTestDiagnostics(stdout, ''), 'unknown')
  const result = commandFailure('docker', args, { code: 1, stdout, stderr: 'PRIVATE-STDERR' })
  assert.match(result.message, /; unknown;/)
  for (const leak of ['Result: FAIL', 'PRIVATE', 'example.invalid', 'alice', 'row email']) {
    assert.ok(!result.message.includes(leak))
  }
})
test('other fixed stages never classify stdout TAP output', () => {
  const result = commandFailure('docker', ownedStage(['db', 'start']),
    { code: 1, stdout: 'not ok 1 - x\n# Looks like you planned 1 tests but ran 2', stderr: '' })
  assert.match(result.message, /; unknown;/)
  assert.ok(!result.message.includes('tap') && !result.message.includes('not ok'))
})
test('safeTestDiagnostics is bounded to fixed symbolic labels', () => {
  assert.equal(safeTestDiagnostics('# Failed test 1: x', ''), 'pg_tap_test_failure:unattributed')
  assert.equal(safeTestDiagnostics('# Looks like you planned 2 tests but ran 3', ''), 'tap_plan_mismatch')
  assert.equal(safeTestDiagnostics('ordinary', 'Error: no space left on device'), 'disk_full')
  assert.equal(safeTestDiagnostics('ordinary', 'plain stderr'), 'unknown')
})
test('Supabase 2.115 sanitized project labels match without losing invocation entropy', async () => {
  const h = harness()
  const project = validationProjectId(token)
  // Pinned CLI contract: invalid runs are replaced, leading punctuation stripped, then capped at 40.
  const cliProject = project.replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^[_.-]+/, '').slice(0, 40)
  assert.equal(cliProject, project)
  assert.ok(cliProject.endsWith(token))
  const dbId = 'd'.repeat(64)
  h.override(a => {
    if (!h.calls.some(c => c.includes('supabase') && c.includes('start'))) return
    if (a[0] !== 'exec') return
    if (a.includes('-aq')) return `${cliReceipt}\n${dbId}`
    if (a.includes('volume') && a.includes('ls')) return `supabase_db_${cliProject}`
    if (a.includes('network') && a.includes('ls')) return 'supabase-network-id'
    if (a.includes('inspect') && a.at(-1) !== cliReceipt) {
      const labels = { 'com.supabase.cli.project': cliProject, 'com.docker.compose.project': cliProject }
      return JSON.stringify([a.includes('container')
        ? { Id: dbId, Name: `/supabase_db_${cliProject}`, Config: { Labels: labels } }
        : { Name: a.includes('volume') ? `supabase_db_${cliProject}` : `supabase_network_${cliProject}`, Labels: labels }])
    }
  })
  await validateDatabase(h.options)
  assert.ok(h.calls.flat().includes('reset'))
  assert.deepEqual(h.calls.at(-1), ['rm', '--force', receipt])
})
