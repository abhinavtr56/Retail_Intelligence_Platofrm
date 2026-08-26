import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch, apiPost } from '../lib/api'
import type { LoginResult, PortalUser } from '../types/portal'

// The current session's user, from the httpOnly cookie FastAPI set on
// login — not from localStorage. A 401 resolves to an error immediately
// (no retries) so "signed out" is instant; RequireAuth and Login both key
// off that to mean "signed out."
export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<PortalUser>('/auth/me'),
    // Only a 401 actually means "signed out", and it is final. Anything else
    // — the backend restarting mid-navigation, a dropped connection — is
    // transient and gets a retry instead of being read as a lost session.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 401) && failureCount < 2,
    // The session lives in an httpOnly cookie with a 14-day TTL, so it cannot
    // go stale between two route changes. Without this the query inherited the
    // client's 30s staleTime and refetched on EVERY page mount; one hiccup on
    // that refetch bounced the user back to /login mid-session.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
  })
}

// Replaces the old client-only usePortalUserStore.signIn — the backend now
// actually validates the password (after the first login for an email,
// which creates the account). Writes straight into the ['auth','me'] cache
// on success so useCurrentUser() elsewhere doesn't need a second round-trip.
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => apiPost<LoginResult>('/auth/login', body),
    onSuccess: (result) => {
      queryClient.setQueryData(['auth', 'me'], result.user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>('/auth/logout', {}),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], undefined)
      queryClient.removeQueries({ queryKey: ['auth', 'me'] })
    },
  })
}
