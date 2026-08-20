import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiPost } from '../lib/api'
import type { LoginResult, PortalUser } from '../types/portal'

// The current session's user, from the httpOnly cookie FastAPI set on
// login — not from localStorage. retry:false so an expected 401 (signed
// out) resolves to an error immediately instead of retrying a few times
// first; RequireAuth and Login both key off `isError` to mean "signed out."
export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<PortalUser>('/auth/me'),
    retry: false,
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
