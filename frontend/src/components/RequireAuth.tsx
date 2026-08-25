import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useAuth'
import { Spinner } from './ui'

// Gates every route except /login behind a real session (GET /api/auth/me).
// Without this, a real login would be pure theater — anyone could still reach
// /#/home or any TPO page directly regardless of whether they'd signed in.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useCurrentUser()

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-page text-ink-muted">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
