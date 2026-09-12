/** Generate the public, body-free Practice discovery catalog from private source. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { createPracticeDiscoveryCatalog } from '../../src/practice-web-test/discoveryCatalog'
import { privatePracticeContentId, privatePracticeSourceDirectory, readPrivatePracticeQuestionBankSource } from './practice-source'
import { repoRoot } from '../lib/books'

function publicRepositoryPath(path: string): boolean {
  const relationship = relative(repoRoot(), path)
  return relationship !== '..' && !relationship.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function argument(name: string): string | null {
  const value = process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`))
  return value?.slice(name.length + 1) ?? null
}

const source = privatePracticeSourceDirectory(process.argv.slice(2))
const contentId = privatePracticeContentId(process.argv.slice(2))
const output = argument('--output')
const expectedRevision = argument('--expected-release-revision')

if (!source || !contentId || !output || !expectedRevision || !/^[a-f0-9]{64}$/.test(expectedRevision)) {
  console.error('ERR  require --source=<external private directory>, --content-id=<stable id>, --output=<public catalog path>, and --expected-release-revision=<sha256>')
  process.exitCode = 1
} else {
  const outputPath = resolve(output)
  if (!publicRepositoryPath(outputPath)) {
    console.error('ERR  discovery catalog output must be inside the public repository')
    process.exitCode = 1
  } else {
    const result = readPrivatePracticeQuestionBankSource(source, contentId)
    if (!result.ok) {
      console.error(`ERR  ${result.reason}`)
      process.exitCode = 1
    } else if (result.value.revision !== expectedRevision) {
      console.error('ERR  private release revision does not match the expected release identity')
      process.exitCode = 1
    } else {
      try {
        const catalog = createPracticeDiscoveryCatalog(result.value)
        mkdirSync(dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
        console.log(`ok   generated body-free practice discovery catalog for ${catalog.families.length} released family(s)`)
      } catch (error) {
        console.error(`ERR  ${error instanceof Error ? error.message : 'practice discovery catalog generation failed'}`)
        process.exitCode = 1
      }
    }
  }
}
