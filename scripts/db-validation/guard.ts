/** Data-target isolation, not a security sandbox against a Docker administrator. */
export const IMAGE = 'docker:28.5.2-dind@sha256:2a232a42256f70d78e3cc5d2b5d6b3276710a0de0596c145f627ecfae90282ac'
export const CLI_IMAGE = 'node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d'
export const CLI_SHA256 = 'ff099608ce758b625532ef03a61f4c9520b995e94ff6cd5480dc0428cad64cb3'
export const CLI_VERSION = '2.115.0'
export type Runner = (args: string[]) => Promise<string>
const OWNER = 'dev.business-japanese-hub.db-validation'
const ID = /^[a-f0-9]{64}$/

function requireProof(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`DB validation refused: ${reason}`)
}

export interface Options {
  run: Runner
  endpoint: string
  token: string
  source: string
  cancelled: () => boolean
  report: (message: string) => void
}

export async function validateDatabase(options: Options): Promise<void> {
  const { endpoint, token, source, cancelled, report } = options
  requireProof(/^unix:\/\/\/[^\r\n]+$/.test(endpoint), 'only an explicit local Unix Docker socket is supported')
  requireProof(/^[a-f0-9]{32}$/.test(token), 'invalid invocation identity')
  const docker: Runner = args => options.run(['--host', endpoint, ...args])
  const daemon = async () => {
    const value = (await docker(['info', '--format', '{{.ID}}'])).trim()
    requireProof(value.length > 0, 'missing daemon identity')
    return value
  }
  const initialDaemon = await daemon()
  const sameDaemon = async () => requireProof(await daemon() === initialDaemon, 'Docker daemon changed; resources preserved')
  const active = () => requireProof(!cancelled(), 'interrupted')
  const name = `bjh-db-validation-${token}`
  // A complete successful inventory is required. A failed command is not an empty inventory.
  const names = (await docker(['ps', '-a', '--format', '{{.Names}}'])).trim().split('\n')
  requireProof(!names.includes(name), 'pre-existing invocation container')
  await sameDaemon()
  active()
  let receipt: string | undefined
  let failure: unknown
  let unknownNestedResource = false
  let checkNested: (() => Promise<void>) | undefined
  let cliReceipt: string | undefined
  const cliName = `bjh-validation-cli-${token}`
  const assertCli = (row: {
    Id?: string; Name?: string; Config?: { Image?: string; Labels?: Record<string, string>; Cmd?: string[] }
    HostConfig?: { NetworkMode?: string; Privileged?: boolean; PortBindings?: object }
    Mounts?: { Type: string; Source: string; Destination: string }[]
  }) => {
    requireProof(cliReceipt && row.Id === cliReceipt && row.Name === `/${cliName}` && row.Config?.Image === CLI_IMAGE &&
      row.Config.Labels?.[OWNER] === token, 'CLI ownership mismatch')
    requireProof(row.HostConfig?.NetworkMode === 'host' && !row.HostConfig.Privileged &&
      !Object.keys(row.HostConfig.PortBindings ?? {}).length &&
      JSON.stringify(row.Config.Cmd) === JSON.stringify(['sleep', 'infinity']), 'CLI configuration drift')
    requireProof(Array.isArray(row.Mounts) && row.Mounts.length === 1 &&
      row.Mounts[0].Type === 'bind' && row.Mounts[0].Source === '/var/run/docker.sock' &&
      row.Mounts[0].Destination === '/var/run/docker.sock', 'CLI socket is not the owned inner socket')
  }
  const proof = async () => {
    await sameDaemon()
    requireProof(receipt && ID.test(receipt), 'missing create receipt; no name-based recovery')
    const rows = JSON.parse(await docker(['inspect', receipt]))
    requireProof(Array.isArray(rows) && rows.length === 1, 'ambiguous container inventory')
    const row = rows[0]
    requireProof(row.Id === receipt && row.Name === `/${name}` && row.Config?.Labels?.[OWNER] === token,
      'container ownership mismatch')
    requireProof(row.Config.Image === IMAGE && row.HostConfig?.Privileged === true,
      'container configuration drift')
    requireProof(Array.isArray(row.Mounts) && row.Mounts.every((m: { Type: string }) => m.Type === 'tmpfs'),
      'persistent volume or host bind detected')
    requireProof(['/var/lib/docker', '/certs/client', '/certs/server'].every(path =>
      Object.hasOwn(row.HostConfig.Tmpfs ?? {}, path)), 'missing disposable filesystem declaration')
    requireProof(row.HostConfig.Tmpfs['/var/lib/docker'] === 'exec', 'daemon data filesystem must permit nested executables')
    requireProof(!row.HostConfig.Binds?.length && !Object.keys(row.HostConfig.PortBindings ?? {}).length &&
      !row.HostConfig.PublishAllPorts && row.HostConfig.NetworkMode !== 'host', 'host resource attachment detected')
    requireProof(row.Path === 'dockerd' && JSON.stringify(row.Args) === JSON.stringify([
      '--host=unix:///var/run/docker.sock', '--data-root=/var/lib/docker', '--storage-driver=vfs',
    ]), 'daemon command drift')
  }
  const owned: Runner = async args => {
    await proof()
    active()
    return docker(args)
  }
  const inner: Runner = args => owned(['exec', receipt!, ...args])
  try {
    // create returns the only authority to mutate; never adopt by name or label.
    const created = (await docker(['create', '--platform', 'linux/amd64', '--name', name,
      '--label', `${OWNER}=${token}`, '--privileged', '--tmpfs', '/var/lib/docker:exec',
      '--tmpfs', '/certs/client', '--tmpfs', '/certs/server', '--entrypoint', 'dockerd', IMAGE,
      '--host=unix:///var/run/docker.sock', '--data-root=/var/lib/docker', '--storage-driver=vfs'])).trim()
    requireProof(ID.test(created), 'invalid create receipt; resources preserved')
    receipt = created
    report(`Owned disposable container: ${receipt}; invocation: ${token}`)
    await owned(['start', receipt])
    // Readiness retries exist solely inside the new container; never restart a daemon.
    await inner(['sh', '-ec', 'i=0; until docker --host unix:///var/run/docker.sock info >/dev/null 2>&1; do i=$((i+1)); [ "$i" -lt 60 ] || exit 1; sleep 1; done'])
    // Once ready, incomplete initial identity/inventory is UNKNOWN, not a partial start.
    unknownNestedResource = true
    const innerDaemon = (await inner(['docker', '--host', 'unix:///var/run/docker.sock', 'info', '--format', '{{.ID}}'])).trim()
    if (!innerDaemon || innerDaemon === initialDaemon) {
      unknownNestedResource = true
      throw new Error('DB validation refused: inner daemon is not distinct')
    }
    for (const args of [['ps', '-aq'], ['volume', 'ls', '-q']]) {
      if ((await inner(['docker', '--host', 'unix:///var/run/docker.sock', ...args])).trim()) {
        unknownNestedResource = true
        throw new Error('DB validation refused: inner daemon contains pre-existing resources')
      }
    }
    const nestedInventory = async () => {
      try {
        // Read-only inventory remains available after a signal, before deciding cleanup.
        const nestedDocker: Runner = async args => {
          await proof()
          return docker(['exec', receipt!, 'docker', '--host', 'unix:///var/run/docker.sock', ...args])
        }
        requireProof((await nestedDocker(['info', '--format', '{{.ID}}'])).trim() === innerDaemon,
          'inner daemon identity changed')
        for (const [kind, list] of [
          ['container', ['ps', '-aq', '--no-trunc']], ['volume', ['volume', 'ls', '-q']],
          ['network', ['network', 'ls', '-q', '--no-trunc']],
        ] as const) {
          const ids = (await nestedDocker([...list])).trim().split('\n').filter(Boolean)
          for (const id of ids) {
            const rows = JSON.parse(await nestedDocker([kind, 'inspect', id]))
            requireProof(Array.isArray(rows) && rows.length === 1, 'ambiguous nested inventory')
            const row = rows[0]
            if (kind === 'container' && row.Id === cliReceipt) { assertCli(row); continue }
            if (kind === 'network' && ['bridge', 'host', 'none'].includes(row.Name)) continue
            const labels = kind === 'container' ? row.Config?.Labels : row.Labels
            requireProof(labels?.['com.supabase.cli.project'] === `bjh-validation-${token}`, 'unknown nested resource')
          }
        }
      } catch (error) {
        unknownNestedResource = true
        throw error
      }
    }
    await nestedInventory()
    unknownNestedResource = false
    checkNested = nestedInventory
    await inner(['mkdir', '-p', '/work'])
    await owned(['cp', `${source}/.`, `${receipt}:/work/`])
    await inner(['sh', '-ec', `wget -q -O /tmp/cli.tar.gz https://github.com/supabase/cli/releases/download/v${CLI_VERSION}/supabase_${CLI_VERSION}_linux_amd64.tar.gz
echo '${CLI_SHA256}  /tmp/cli.tar.gz' | sha256sum -c -
tar -xzf /tmp/cli.tar.gz -C /tmp supabase supabase-go`])
    // The official CLI is a glibc/Bun binary. Run the unmodified release in a
    // Debian container inside the owned daemon, not the Alpine daemon image.
    const privateDocker: Runner = args => inner(['docker', '--host', 'unix:///var/run/docker.sock', ...args])
    cliReceipt = (await privateDocker(['create', '--name', cliName,
      '--label', `${OWNER}=${token}`,
      '--network', 'host', '--mount', 'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
      CLI_IMAGE, 'sleep', 'infinity'])).trim()
    if (!ID.test(cliReceipt)) {
      unknownNestedResource = true
      throw new Error('DB validation refused: invalid CLI create receipt')
    }
    const cliProof = async () => {
      try {
        await proof()
        const rows = JSON.parse(await docker(['exec', receipt!, 'docker', '--host', 'unix:///var/run/docker.sock', 'container', 'inspect', cliReceipt!]))
        requireProof(Array.isArray(rows) && rows.length === 1, 'ambiguous CLI inventory')
        assertCli(rows[0])
      } catch (error) {
        unknownNestedResource = true
        throw error
      }
    }
    await cliProof()
    const dataMountOptions = (await inner(['sh', '-ec', `awk '$2 == "/var/lib/docker" { print $4 }' /proc/mounts`])).trim()
    report(`Owned daemon /var/lib/docker mount options: ${dataMountOptions || 'unavailable'}`)
    requireProof(dataMountOptions.split(',').includes('rw') && !dataMountOptions.split(',').includes('noexec'),
      'daemon data filesystem cannot execute nested containers')
    await privateDocker(['start', cliReceipt])
    await privateDocker(['exec', cliReceipt, 'mkdir', '-p', '/work', '/etc/ssl/certs'])
    await privateDocker(['cp', '/work/.', `${cliReceipt}:/work/`])
    for (const binary of ['supabase', 'supabase-go']) {
      await privateDocker(['cp', `/tmp/${binary}`, `${cliReceipt}:/usr/local/bin/${binary}`])
    }
    // The pinned CLI also spawns Docker's static client for local bootstrap.
    await privateDocker(['cp', '/usr/local/bin/docker', `${cliReceipt}:/usr/local/bin/docker`])
    await privateDocker(['cp', '/etc/ssl/certs/ca-certificates.crt', `${cliReceipt}:/etc/ssl/certs/ca-certificates.crt`])
    requireProof((await privateDocker(['exec', cliReceipt, 'supabase', '--version'])).trim() === CLI_VERSION, 'CLI version mismatch')
    // No arbitrary CLI pass-through, linked metadata, DB URL, host env, sockets or source mounts.
    for (const args of [
      ['db', 'start'], ['db', 'reset', '--local'],
      ['test', 'db', '--local', 'supabase/tests'],
      ['db', 'lint', '--local', '--schema', 'public', '--level', 'warning', '--fail-on', 'error'],
    ]) {
      await nestedInventory()
      await cliProof()
      requireProof((await inner(['docker', '--host', 'unix:///var/run/docker.sock', 'info', '--format', '{{.ID}}'])).trim() === innerDaemon,
        'inner daemon identity changed')
      const output = await privateDocker(['exec', '--workdir', '/work', cliReceipt, 'env', '-i', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME=/root', 'DOCKER_HOST=unix:///var/run/docker.sock', 'SUPABASE_TELEMETRY_DISABLED=true',
        'supabase', '--workdir', '/work', ...args])
      report(`PASS supabase ${args.join(' ')}`)
      if (args[0] === 'test' || args[1] === 'lint') report(output)
    }
    await nestedInventory()
  } catch (error) {
    failure = error
  } finally {
    if (receipt) {
      try {
        if (checkNested) await checkNested()
        requireProof(!unknownNestedResource, 'unknown nested resource; preserve for owner inspection')
        await proof()
        // Only an immutable receipt ID; all nested data is in this container's tmpfs.
        await docker(['rm', '--force', receipt])
        report(`Removed owned disposable container: ${receipt}`)
      } catch {
        report(`Cleanup refused; preserve container ${receipt} for owner inspection. No fallback performed.`)
        failure ??= new Error('DB validation cleanup could not prove ownership')
      }
    }
  }
  if (failure) throw failure
}
