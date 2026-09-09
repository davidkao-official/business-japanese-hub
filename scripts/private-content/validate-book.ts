/** Validate a Book from a private checkout without copying it into the public repository. */
import { privateSourceDirectory, readPrivateBookSource } from './source'

const source = privateSourceDirectory(process.argv.slice(2))
if (!source) {
  console.error('ERR  pass --source=<absolute directory outside the public repository>')
  process.exitCode = 1
} else {
  const result = readPrivateBookSource(source)
  if (!result.ok) {
    console.error(`ERR  ${result.reason}`)
    process.exitCode = 1
  } else {
    // Do not log title, body, or any other proprietary payload.
    console.log(`ok   private ${result.value.contentKind} ${result.value.contentId} revision ${result.value.revision}`)
  }
}
