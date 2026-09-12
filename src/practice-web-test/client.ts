import { createBrowserPlatformServices } from '@business-japanese-hub/platform-auth'
import type { PracticeRuntimePayload } from '../content-delivery/privatePracticeQuestionBank'
import { PRIVATE_CONTENT_REVISION, isPrivateContentId } from '../content-delivery/references'
import { validateRuntimePayload } from './runtime'

export type PracticeFetchResult =
  | { kind: 'ok'; payload: PracticeRuntimePayload }
  | { kind: 'signed-out' | 'forbidden' | 'unavailable' | 'missing' }

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '')).replace(/\/+$/, '') || null
}

export async function fetchPracticePayload(contentId: string, revision: string): Promise<PracticeFetchResult> {
  if (!isPrivateContentId(contentId) || !PRIVATE_CONTENT_REVISION.test(revision)) return { kind: 'missing' }
  const platform = createBrowserPlatformServices('library')
  if (!platform.client) return { kind: 'signed-out' }
  const token = (await platform.client.auth.getSession()).data.session?.access_token
  if (!token) return { kind: 'signed-out' }
  const base = functionsBaseUrl()
  if (!base) return { kind: 'unavailable' }
  try {
    const response = await fetch(`${base}/content-delivery?contentId=${encodeURIComponent(contentId)}&revision=${revision}`, { headers: { Authorization: `Bearer ${token}` } })
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (response.status === 404) return { kind: 'missing' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await response.json() as { content?: { payload?: unknown } }
    const payload = validateRuntimePayload(body.content?.payload)
    return payload ? { kind: 'ok', payload } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}
