import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Pill, useToast } from '../components/ui'
import { usePortalUserStore } from '../store/portalUser'

// Ported from login.html + js/portal.js's Portal.initLogin(). No real identity
// provider yet — any non-empty email/password signs into a local workspace, same
// client-side stand-in as the vanilla app.
export function Login() {
  const signIn = usePortalUserStore((s) => s.signIn)
  const { show } = useToast()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter both an email and a password to continue.')
      return
    }
    setError('')
    signIn(email.trim())
    setSubmitting(true)
    window.setTimeout(() => navigate('/home'), 450)
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

          <Button type="submit" variant="primary" size="lg" block disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-5 border-t border-border-subtle pt-4 text-center text-[11.5px] leading-[1.6] text-ink-muted">
          <Pill tone="violet" className="mb-2">
            V1 · Local dev
          </Pill>
          <br />
          Authentication isn't wired to a real identity provider yet — any email/password signs you into a local workspace.
        </div>
      </div>
    </div>
  )
}
