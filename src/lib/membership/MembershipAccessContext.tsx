import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@business-japanese-hub/platform-auth'
import type {
  PlusMembershipAccess,
  PlusMembershipAccessRepository,
} from './access'

export type MembershipAccessState =
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  | { kind: 'non-member' }
  | { kind: 'active-member' }
  | { kind: 'unavailable' }

export interface MembershipAccessContextValue {
  state: MembershipAccessState
  retry(): void
}

const DEFAULT_VALUE: MembershipAccessContextValue = {
  state: { kind: 'unavailable' },
  retry: () => {},
}

const MembershipAccessContext = createContext<MembershipAccessContextValue | null>(null)

function stateForAccess(access: PlusMembershipAccess): MembershipAccessState {
  if (access === 'active') return { kind: 'active-member' }
  if (access === 'non-member') return { kind: 'non-member' }
  return { kind: 'unavailable' }
}

interface MembershipResult {
  requestKey: number
  userId: string
  access: PlusMembershipAccess
}

export function MembershipAccessProvider({
  repository,
  children,
}: {
  repository: PlusMembershipAccessRepository | null
  children: ReactNode
}) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [result, setResult] = useState<MembershipResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (authLoading || !userId || !repository) return
    let cancelled = false

    void repository
      .getAccess(userId)
      .then((access) => {
        if (!cancelled) setResult({ requestKey: refreshKey, userId, access })
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ requestKey: refreshKey, userId, access: 'unavailable' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, userId, repository, refreshKey])

  const state = useMemo<MembershipAccessState>(() => {
    if (authLoading) return { kind: 'checking' }
    if (!userId) return { kind: 'signed-out' }
    if (!repository) return { kind: 'unavailable' }
    if (result?.requestKey !== refreshKey || result.userId !== userId) {
      return { kind: 'checking' }
    }
    return stateForAccess(result.access)
  }, [authLoading, userId, repository, refreshKey, result])

  const value = useMemo<MembershipAccessContextValue>(
    () => ({
      state,
      retry: () => setRefreshKey((current) => current + 1),
    }),
    [state],
  )

  return <MembershipAccessContext.Provider value={value}>{children}</MembershipAccessContext.Provider>
}

export function useMembershipAccess(): MembershipAccessContextValue {
  return useContext(MembershipAccessContext) ?? DEFAULT_VALUE
}
