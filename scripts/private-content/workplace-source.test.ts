import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { after, test } from 'node:test'
import { sampleWorkplaceLearnItem } from '../../src/workplace-learn/sample'
import { repoRoot } from '../lib/books'
import { privateWorkplaceSourceDirectory, readPrivateWorkplaceSource } from './workplace-source'

const temporaryPaths: string[] = []
after(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true })
})

function privateAuthoringItem() {
  const body = { ...sampleWorkplaceLearnItem }
  delete body.sampleLabel
  return {
    ...body,
    access: 'plus',
    publication: { status: 'released', releasedAt: '2026-09-24', releaseNotes: 'Reviewed release.' },
    reviewer: { id: 'editor-1', reviewedAt: '2026-09-23' },
    rights: { status: 'cleared', basis: 'original', attestation: 'Original hypothetical content.' },
  }
}

test('private Workplace Learn source requires an absolute directory outside the public checkout', () => {
  const parent = mkdtempSync(join(tmpdir(), 'workplace-source-'))
  temporaryPaths.push(parent)
  const external = join(parent, 'private')
  mkdirSync(external)
  assert.equal(privateWorkplaceSourceDirectory(['--source=relative/private']), null)
  assert.equal(privateWorkplaceSourceDirectory([`--source=${repoRoot()}`]), null)
  assert.equal(privateWorkplaceSourceDirectory([`--source=${external}`]), realpathSync(external))
  assert.equal(isAbsolute(privateWorkplaceSourceDirectory([`--source=${external}`]) ?? ''), true)
})

test('private Workplace Learn source rejects a directory symlink resolving into the public checkout', () => {
  const parent = mkdtempSync(join(tmpdir(), 'workplace-source-link-'))
  temporaryPaths.push(parent)
  const link = join(parent, 'public-source')
  symlinkSync(repoRoot(), link, 'dir')
  assert.equal(privateWorkplaceSourceDirectory([`--source=${link}`]), null)
})

test('canonical file symlinks into the public checkout fail without exposing private paths or text', () => {
  const parent = mkdtempSync(join(tmpdir(), 'workplace-source-file-link-'))
  temporaryPaths.push(parent)
  const source = join(parent, 'private')
  mkdirSync(source)
  const canonicalFile = join(source, 'workplace-item.json')
  symlinkSync(join(repoRoot(), 'package.json'), canonicalFile, 'file')
  const result = readPrivateWorkplaceSource(source, sampleWorkplaceLearnItem.id)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.reason, /resolves inside the public repository/)
    assert.equal(result.reason.includes(parent), false)
  }
})

test('reads only workplace-item.json and returns the prepared member release', () => {
  const parent = mkdtempSync(join(tmpdir(), 'workplace-source-valid-'))
  temporaryPaths.push(parent)
  const source = join(parent, 'private')
  mkdirSync(source)
  const authoring = privateAuthoringItem()
  writeFileSync(join(source, 'workplace-item.json'), JSON.stringify(authoring))
  const result = readPrivateWorkplaceSource(source, authoring.id)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.contentKind, 'workplace-lesson')
    assert.equal(JSON.stringify(result.value).includes(authoring.whatToSayJapanese), true)
  }
  const missing = readPrivateWorkplaceSource(join(parent, 'missing'), authoring.id)
  assert.deepEqual(missing, { ok: false, reason: 'private source is missing workplace-item.json' })
})
