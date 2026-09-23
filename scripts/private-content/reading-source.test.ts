import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { privateReadingSourceDirectory } from './reading-source'
import { repoRoot } from '../lib/books'

const temporaryPaths: string[] = []
after(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true })
})

test('private Reading source admission requires an absolute source outside the public repository', () => {
  assert.equal(privateReadingSourceDirectory(['--source=relative/private']), null)
  assert.equal(privateReadingSourceDirectory([`--source=${repoRoot()}`]), null)
})

test('private Reading source admission rejects a symlink that resolves into the public repository', () => {
  const parent = mkdtempSync(join(tmpdir(), 'reading-source-'))
  temporaryPaths.push(parent)
  const link = join(parent, 'public-source')
  symlinkSync(repoRoot(), link, 'dir')
  assert.equal(privateReadingSourceDirectory([`--source=${link}`]), null)
})
