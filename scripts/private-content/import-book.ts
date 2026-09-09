/**
 * Controlled server import for a validated private Book release.
 *
 * This command is intentionally absent from public CI: it needs a private
 * checkout and server-only credentials, neither of which belongs in a PR
 * artifact or a frontend build.
 */
import { createClient } from '@supabase/supabase-js'
import { privateSourceDirectory, readPrivateBookSource } from './source'

const source = privateSourceDirectory(process.argv.slice(2))
const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!source || !url || !serviceRoleKey) {
  console.error('ERR  require --source=<external private directory>, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY')
  process.exitCode = 1
} else {
  const result = readPrivateBookSource(source)
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
    } else {
      console.log(`ok   imported ${release.contentKind} ${release.contentId} revision ${release.revision}`)
    }
  }
}
