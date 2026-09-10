/** Validate a private Practice/Web Test bank without copying it into public Git. */
import { privatePracticeContentId, privatePracticeSourceDirectory, readPrivatePracticeQuestionBankSource } from './practice-source'

const source = privatePracticeSourceDirectory(process.argv.slice(2))
const contentId = privatePracticeContentId(process.argv.slice(2))
if (!source || !contentId) {
  console.error('ERR  pass --source=<absolute directory outside the public repository> and --content-id=<stable id>')
  process.exitCode = 1
} else {
  const result = readPrivatePracticeQuestionBankSource(source, contentId)
  if (!result.ok) {
    console.error(`ERR  ${result.reason}`)
    process.exitCode = 1
  } else {
    console.log(`ok   private ${result.value.contentKind} ${result.value.contentId} revision ${result.value.revision}`)
  }
}
