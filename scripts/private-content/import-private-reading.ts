/** Controlled server import for a validated external Business Reading item. */
import { createClient } from '@supabase/supabase-js'
import { privateReadingContentId, privateReadingSourceDirectory, readPrivateReadingSource } from './reading-source'

const source = privateReadingSourceDirectory(process.argv.slice(2))
const contentId = privateReadingContentId(process.argv.slice(2))
const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!source || !contentId || !url || !serviceRoleKey) {
  console.error('ERR  require --source=<external private directory>, --content-id=<stable id>, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY')
  process.exitCode = 1
} else {
  const result = readPrivateReadingSource(source, contentId)
  if (!result.ok) {
    console.error(`ERR  ${result.reason}`)
    process.exitCode = 1
  } else {
    const release = result.value
    const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await db.from('private_content_release').insert({
      content_id: release.contentId,
      revision: release.revision,
      content_kind: release.contentKind,
      access_scope: release.accessScope,
      payload: release.payload,
    })
    if (error) {
      console.error('ERR  server import failed')
      process.exitCode = 1
    } else console.log(`ok   imported ${release.contentKind} ${release.contentId} revision ${release.revision}`)
  }
}
