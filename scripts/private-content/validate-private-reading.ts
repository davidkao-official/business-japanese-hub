/** Validate a Reading item from a private checkout without copying it into public Git. */
import { privateReadingContentId, privateReadingSourceDirectory, readPrivateReadingSource } from './reading-source'

const source = privateReadingSourceDirectory(process.argv.slice(2))
const contentId = privateReadingContentId(process.argv.slice(2))
if (!source || !contentId) {
  console.error('ERR  pass --source=<absolute directory outside the public repository> and --content-id=<stable id>')
  process.exitCode = 1
} else {
  const result = readPrivateReadingSource(source, contentId)
  if (!result.ok) {
    console.error(`ERR  ${result.reason}`)
    process.exitCode = 1
  } else {
    console.log(`ok   private ${result.value.contentKind} ${result.value.contentId} revision ${result.value.revision}`)
  }
}
