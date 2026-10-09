import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthClient, SessionUser, SignUpResult } from './types'

export interface AuthContextValue {
  user: SessionUser | null
  /** Changes on session boundaries, including batched sign-out/sign-in events. */
  sessionVersion: number
  loading: boolean
  getAccessToken(): Promise<string | null>
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<SignUpResult>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export interface AuthProviderProps {
  authClient: AuthClient
  children: ReactNode
}

/**
 * Shared reactive session provider. Public product surfaces render immediately;
 * a missing or failed restore degrades to signed-out instead of blocking them.
 */
export function AuthProvider({ authClient, children }: AuthProviderProps) {
  const [{ user, sessionVersion }, setSession] = useState<{ user: SessionUser | null; sessionVersion: number }>({ user: null, sessionVersion: 0 })
  const setUser = useCallback((nextUser: SessionUser | null) => {
    setSession((current) => {
      const sameSession = current.user === nextUser || Boolean(
        current.user && nextUser && current.user.id === nextUser.id
        && current.user.sessionId && current.user.sessionId === nextUser.sessionId,
      )
      return { user: nextUser, sessionVersion: current.sessionVersion + (sameSession ? 0 : 1) }
    })
  }, [])
  const [loading, setLoading] = useState(true)
  const authEventSeenRef = useRef(false)

  useEffect(() => {
    let active = true
    authEventSeenRef.current = false

    const unsubscribe = authClient.onAuthStateChange((nextUser) => {
      authEventSeenRef.current = true
      if (active) setUser(nextUser)
    })

    authClient
      .getSession()
      .then((sessionUser) => {
        if (active && !authEventSeenRef.current) setUser(sessionUser)
      })
      .catch(() => {
        if (active && !authEventSeenRef.current) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [authClient, setUser])

  const getAccessToken = useCallback(
    () => authClient.getAccessToken?.() ?? Promise.resolve(null),
    [authClient],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionVersion,
      loading,
      getAccessToken,
      signIn: async (email: string, password: string) => {
        const { user: nextUser } = await authClient.signInWithPassword({ email, password })
        authEventSeenRef.current = true
        setUser(nextUser)
      },
      signUp: async (email: string, password: string) => {
        const result = await authClient.signUpWithPassword({ email, password })
        if (result.signedIn) {
          authEventSeenRef.current = true
          setUser(result.user)
        }
        return result
      },
      signOut: async () => {
        await authClient.signOut()
        authEventSeenRef.current = true
        setUser(null)
      },
    }),
    [authClient, getAccessToken, user, sessionVersion, loading, setUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an <AuthProvider>')
  return context
}
