import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  backendRequest,
  clearStoredLocalSession,
  getStoredLocalSession,
  storeLocalSession,
} from '../utils/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredLocalSession())
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(getStoredLocalSession()))
  const [error, setError] = useState('')
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
  const [authDialogMode, setAuthDialogMode] = useState('login')

  const clearAuthState = useCallback(() => {
    clearStoredLocalSession()
    setSession(null)
    setUser(null)
  }, [])

  const applyAuthPayload = useCallback((payload) => {
    const nextSession = payload?.session?.token
      ? {
          id: payload.session.id,
          token: payload.session.token,
          tokenType: payload.session.tokenType || 'Bearer',
          expiresAt: payload.session.expiresAt || null,
        }
      : null

    if (!nextSession || !payload?.user) {
      return null
    }

    storeLocalSession(nextSession)
    setSession(nextSession)
    setUser(payload.user)
    setError('')

    return {
      session: nextSession,
      user: payload.user,
    }
  }, [])

  const request = useCallback(
    async (path, options = {}) => {
      return backendRequest(path, {
        ...options,
        token: options.token || session?.token || '',
      })
    },
    [session?.token],
  )

  const closeAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(false)
  }, [])

  const openAuthDialog = useCallback((mode = 'login') => {
    setAuthDialogMode(mode === 'register' ? 'register' : 'login')
    setIsAuthDialogOpen(true)
  }, [])

  const me = useCallback(async () => {
    if (!session?.token) {
      setUser(null)
      setIsLoading(false)
      return null
    }

    setIsLoading(true)

    try {
      const data = await backendRequest('/api/local-auth/me', {
        token: session.token,
      })

      setUser(data.user)
      setError('')
      return data.user
    } catch (requestError) {
      clearAuthState()
      setError(requestError.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [clearAuthState, session?.token])

  const register = useCallback(
    async ({ email, password, displayName }) => {
      setIsLoading(true)

      try {
        const data = await backendRequest('/api/local-auth/register', {
          method: 'POST',
          body: {
            email,
            password,
            displayName,
          },
        })

        const result = applyAuthPayload(data)
        closeAuthDialog()
        return result
      } catch (requestError) {
        setError(requestError.message)
        throw requestError
      } finally {
        setIsLoading(false)
      }
    },
    [applyAuthPayload, closeAuthDialog],
  )

  const login = useCallback(
    async ({ email, password }) => {
      setIsLoading(true)

      try {
        const data = await backendRequest('/api/local-auth/login', {
          method: 'POST',
          body: {
            email,
            password,
          },
        })

        const result = applyAuthPayload(data)
        closeAuthDialog()
        return result
      } catch (requestError) {
        setError(requestError.message)
        throw requestError
      } finally {
        setIsLoading(false)
      }
    },
    [applyAuthPayload, closeAuthDialog],
  )

  const logout = useCallback(async () => {
    const activeToken = session?.token

    try {
      if (activeToken) {
        await backendRequest('/api/local-auth/logout', {
          method: 'POST',
          token: activeToken,
        })
      }
    } catch {
      // Best effort logout.
    } finally {
      clearAuthState()
      setError('')
      closeAuthDialog()
      setIsLoading(false)
    }
  }, [clearAuthState, closeAuthDialog, session?.token])

  useEffect(() => {
    me()
  }, [me])

  const value = useMemo(
    () => ({
      authDialogMode,
      closeAuthDialog,
      error,
      isAuthDialogOpen,
      isAuthenticated: Boolean(user?.id && session?.token),
      isLoading,
      login,
      logout,
      me,
      openAuthDialog,
      register,
      request,
      session,
      user,
    }),
    [
      authDialogMode,
      closeAuthDialog,
      error,
      isAuthDialogOpen,
      isLoading,
      login,
      logout,
      me,
      openAuthDialog,
      register,
      request,
      session,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
