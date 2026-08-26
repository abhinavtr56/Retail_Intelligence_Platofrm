import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, useToast } from '../components/ui'
import { useCurrentUser, useLogin } from '../hooks/useAuth'
import { ApiError } from '../lib/api'

// Ported from login.html + js/portal.js's Portal.initLogin(), now backed by real
// FastAPI auth (POST /api/auth/login — see backend/app/auth_store.py) instead of a
// client-side stand-in. First login for a given email creates the account on the
// spot (frictionless demo signup, same as before); every login after that actually
// checks the password.
export function Login() {
  const { data: currentUser } = useCurrentUser()
  const login = useLogin()
  const { show } = useToast()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Already signed in (valid session cookie) — skip straight past the form.
  useEffect(() => {
    if (currentUser) navigate('/home', { replace: true })
  }, [currentUser, navigate])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter both an email and a password to continue.')
      return
    }
    setError('')
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => navigate('/home'),
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "Couldn't reach the server — is the backend running?")
        },
      },
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page p-6">
      <div className="fade-in-up w-full max-w-[400px] rounded-[var(--r-xl)] border border-border-subtle bg-surface-card p-[36px_32px_30px] shadow-[var(--shadow-lg)]">
        <div className="mb-7 flex items-center gap-2.5">
          <img src="/image.png" alt="TransOrg" className="h-8 w-8" />
          <span className="text-sm font-extrabold tracking-[-0.01em]">TRANSORG ANALYTICS</span>
        </div>
        <h1 className="mb-1.5 text-xl">Retail Intelligence Platform</h1>
        <p className="mb-6 text-[13px] leading-[1.5] text-ink-muted">Sign in to continue to your workspace.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && <div className="rounded-[var(--r-sm)] bg-status-danger-bg p-[8px_12px] text-[12.5px] text-[#B91C1C]">{error}</div>}

          <Field label="Work email">
            {/* An INSTRUCTION, not a specimen address. The placeholder used to be
                a realistic personal email, which renders as grey text inside an
                otherwise-empty field and reads as a value somebody had already
                filled in. `autoComplete="username"` is deliberately kept — the
                browser's own saved-credential fill is a feature, not a bug. */}
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" autoComplete="username" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </Field>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-secondary">
              <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-brand-violet" /> Keep me signed in
            </label>
            <button
              type="button"
              onClick={() => show('Password reset coming soon.')}
              className="text-[12.5px] font-semibold text-brand-violet"
            >
              Forgot password?
            </button>
          </div>

          <Button type="submit" variant="primary" size="lg" block disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-5 border-t border-border-subtle pt-4 text-center text-[11.5px] leading-[1.6] text-ink-muted">
          First sign-in creates your workspace — after that, your password is checked for real.
        </div>
      </div>
    </div>
  )
}
