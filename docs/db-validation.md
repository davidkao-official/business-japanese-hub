# Owned disposable database validation

Run `pnpm test:db-guard` for the mock refusal tests, then `pnpm validate:db`
for the database gate. The latter runs the existing Supabase 2.115.0
start → local reset → pgTAP → schema lint sequence on a new disposable daemon.
CI uses this same entrypoint. There are no arguments or target overrides.

This is a data-target ownership boundary, **not** a security sandbox against
malicious repository SQL, Docker administrators or privileged container code.
It requires a local Unix-socket Docker daemon that supports privileged Linux
amd64 containers (and emulation on ARM). The wrapper does not change daemon
settings. If unavailable, stop and report the DB gate as unavailable; do not
fall back to a shared stack. No frontend ports are published.

## Ownership and refusal contract

1. Reject Docker/Supabase/database target environment overrides and all CLI
   arguments, including remote/linked reset targets. Resolve a local Unix
   socket once; pin the outer daemon ID and recheck it before each operation.
2. Snapshot only committed regular `supabase/config.toml`, migrations and tests
   at the printed input HEAD. Reject modified tracked DB inputs and symlinks.
   Exclude worktree `.temp`, `.branches`, `.env`, credentials, backups, private
   rows and untracked files. The snapshot uses its own exclusive temporary
   directory and invocation-specific project ID; the ID alone is not ownership.
3. Require successful inventory and an unused cryptographically random name.
   `docker create` atomically reserves it. Only its full returned container ID
   grants mutation authority. A collision, missing receipt or malformed result
   never permits adoption, relabeling, name-based deletion or retry cleanup.
4. Inspect the receipt ID, invocation label, pinned image and exact daemon
   command. Reject persistent volumes, bind mounts, published ports and host
   networking. Nested Docker data and image-declared certificate volumes are
   replaced with tmpfs. The nested daemon has only its private Unix socket;
   neither the host socket nor host source is mounted into it.
5. Require a distinct inner daemon with no containers or volumes. Before every
   gate and cleanup, inventory all nested containers, volumes and networks;
   only default networks or this invocation's Supabase project are allowed.
   Failure or unknown inventory blocks further gates and cleanup. The private
   daemon and empty initial inventory establish resource ownership; labels
   are additional drift detection, not permission to reuse pre-existing data.
6. Copy the bounded source snapshot into the receipt container and install the
   checksum-pinned CLI. Run only the four fixed local commands with an empty
   environment plus explicit local Docker socket and tool paths. Never run
   `supabase stop`, prune, linked reset, DB-URL reset or destructive fallback.
7. On success or failure, inspect ownership again. Remove only the exact created
   outer container ID; its tmpfs contains all created DB resources. Unknown
   ownership, daemon drift or failed inventory preserves the container and
   fails the command. A partial start failure may remove its proved outer
   receipt before an inner daemon exists. No global volume/network cleanup is
   permitted. Source cleanup removes only the invocation's `mkdtemp` snapshot.

SIGINT/SIGTERM prevents subsequent validation operations; an in-flight command
is allowed to settle (bounded by its timeout) before ownership-checked cleanup.
Read-only inventory is allowed after interruption. SIGKILL or host failure may
leave resources: there is deliberately no automated recovery/adoption command.
The printed receipt is an investigation lead, not authorization to clean up a
later invocation. A Docker administrator can bypass these controls; agents
must use the canonical entrypoint instead of issuing raw commands.

## Pinned tooling provenance

- Docker `28.5.2-dind` manifest digest
  `sha256:2a232a42256f70d78e3cc5d2b5d6b3276710a0de0596c145f627ecfae90282ac`
  was obtained from the [Docker Official Image tag API](https://registry.hub.docker.com/v2/repositories/library/docker/tags/28.5.2-dind).
- Supabase `2.115.0` Linux amd64 archive digest
  `ff099608ce758b625532ef03a61f4c9520b995e94ff6cd5480dc0428cad64cb3`
  was obtained from the [official release asset metadata](https://api.github.com/repos/supabase/cli/releases/tags/v2.115.0).
  The wrapper verifies SHA256 before extraction and verifies the CLI version.
  It does not upgrade or execute the host's Supabase binary.
- The [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-reset)
  describes the local/linked/DB-URL distinction. Only `--local` is admitted.

The first implementation was verified with mocks and non-DB source gates only
on the incident workstation. A hosted CI success is required for real nested
daemon / migration / pgTAP / lint evidence; do not relabel mock results as a
database pass. Preserve the input HEAD and CI run with the review evidence.

## Incident preservation

[#98's review checkpoint](https://github.com/davidkao-official/business-japanese-hub/issues/98#issuecomment-5548975929)
records a reset of a pre-existing local stack at 2026-09-05 11:26:20 JST.
The affected original stack is outside this tool's authority. Do not reset,
restart, stop, delete, prune, restore or attempt recovery on it. Read-only
incident triage must avoid private-row exports and full environment dumps.
Original loss scope and recoverability remain UNKNOWN without evidence.
Later passing tests do not establish absence of data loss. Recovery or deliberate
reuse needs a separate owner decision; do not treat a live-volume copy as a
verified recoverable backup.
