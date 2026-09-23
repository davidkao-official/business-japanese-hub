/** Validate one Workplace Learn item in an external private checkout. */
import { privateWorkplaceContentId, privateWorkplaceSourceDirectory, readPrivateWorkplaceSource } from './workplace-source'

const source = privateWorkplaceSourceDirectory(process.argv.slice(2))
const contentId = privateWorkplaceContentId(process.argv.slice(2))
if (!source || !contentId) {
  console.error('ERR  pass --source=<absolute directory outside the public repository> and --content-id=<stable id>')
  process.exitCode = 1
} else {
  const result = readPrivateWorkplaceSource(source, contentId)
  if (!result.ok) {
    console.error(`ERR  ${result.reason}`)
    process.exitCode = 1
  } else {
    console.log(`ok   private ${result.value.contentKind} ${result.value.contentId} revision ${result.value.revision}`)
  }
}
