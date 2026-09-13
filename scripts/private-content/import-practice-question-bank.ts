/** Controlled server import for a validated external Practice/Web Test bank. */
import { createClient } from '@supabase/supabase-js'
import { privatePracticeContentId, privatePracticeSourceDirectory, readPrivatePracticeQuestionBankSource } from './practice-source'

const source = privatePracticeSourceDirectory(process.argv.slice(2))
const contentId = privatePracticeContentId(process.argv.slice(2))
const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!source || !contentId || !url || !serviceRoleKey) {
  console.error('ERR  require --source=<external private directory>, --content-id=<stable id>, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY')
  process.exitCode = 1
} else {
  const result = readPrivatePracticeQuestionBankSource(source, contentId)
  if (!result.ok) {
    console.error(`ERR  ${result.reason}`)
    process.exitCode = 1
  } else {
    const release = result.value
    const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await db.rpc('import_practice_question_release', {
      p_content_id: release.contentId,
      p_content_revision: release.revision,
      p_payload: release.payload,
    })
    if (error) {
      console.error('ERR  server import failed')
      process.exitCode = 1
    } else console.log(`ok   imported ${release.contentKind} ${release.contentId} revision ${release.revision}`)
  }
}
