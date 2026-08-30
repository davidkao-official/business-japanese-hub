import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthClient, SessionUser, SignUpResult } from './types'

export interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
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
  const [user, setUser] = useState<SessionUser | null>(null)
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
  }, [authClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
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
    [authClient, user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an <AuthProvider>')
  return context
}
