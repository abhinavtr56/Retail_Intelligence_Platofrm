import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../icons'
import { Button, Field, Input } from '../ui'
import { proxyFetch, saveProxyConn, loadProxyConn, clearProxyConn } from '../../lib/portalConnectors'
import { MODULES } from './modules'

interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}
interface Saved {
  api_key: string
}

function buildSystemPrompt() {
  const moduleList = MODULES.map((m) => `- ${m.title} (${m.live ? 'LIVE — available now' : 'coming soon, not yet available'}): ${m.desc}`).join('\n')
  return (
    `You are the capability advisor for TIQ, a retail intelligence platform with six modules:\n${moduleList}\n\n` +
    `A user will describe the data they have and what they're trying to accomplish. Recommend which module(s) — ` +
    `one or several — best fit their need, and briefly explain how they'd use it/them together. If their need ` +
    `matches only modules still "coming soon", say so honestly and note that Trade Promotion Optimization is the ` +
    `only module available to actually use today. Be concise: 3-5 sentences, not an essay. Don't invent ` +
    `capabilities beyond what's listed above.`
  )
}

// Ported from js/portal.js's renderAdvisor/renderAdvisorKeySetup/renderAdvisorChat —
// the OpenAI-powered capability advisor. Routed through FastAPI
// (app/routers/connectors.py), same as the other proxy-backed connectors.
export function AdvisorCard() {
  const [apiKey, setApiKey] = useState<string | null>(() => loadProxyConn<Saved>('openai')?.api_key ?? null)

  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-xl)] border border-border-subtle bg-surface-card p-[18px_20px] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2.5">
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-tint-lavender text-tint-lavender-icon [&_svg]:h-[17px] [&_svg]:w-[17px]">
          <Icon name="sparkles" />
        </div>
        <div>
          <h3 className="text-[14.5px]">Not sure which module to use?</h3>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            {apiKey ? "Tell the advisor what data you have and what you're trying to do." : 'Describe your data and goal — the advisor suggests which capability fits.'}
          </p>
        </div>
      </div>

      {apiKey ? (
        <AdvisorChat
          apiKey={apiKey}
          onReset={() => {
            clearProxyConn('openai')
            setApiKey(null)
          }}
        />
      ) : (
        <AdvisorKeySetup onReady={(key) => setApiKey(key)} />
      )}
    </div>
  )
}

function AdvisorKeySetup({ onReady }: { onReady: (key: string) => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  const go = () => {
    if (!key.trim()) {
      setError('Enter an OpenAI API key to continue.')
      return
    }
    saveProxyConn('openai', { api_key: key.trim() })
    onReady(key.trim())
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error && <div className="rounded-[var(--r-sm)] bg-status-danger-bg p-[8px_12px] text-[12.5px] text-[#B91C1C]">{error}</div>}
      <Field label="OpenAI API key">
        <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="sk-..." />
      </Field>
      <div className="flex items-start gap-2 rounded-[var(--r-md)] bg-surface-muted p-[10px_12px] text-[11.5px] leading-[1.5] text-ink-muted [&_svg]:mt-px [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0">
        <Icon name="info" />
        <span>Routed through the app's own backend, same as the other connectors. Kept in this browser tab only — sent to the backend, then straight to OpenAI.</span>
      </div>
      <Button variant="secondary" block onClick={go}>
        <Icon name="sparkles" /> Start advisor
      </Button>
    </div>
  )
}

function AdvisorChat({ apiKey, onReset }: { apiKey: string; onReset: () => void }) {
  const historyRef = useRef<ChatMsg[]>([{ role: 'system', content: buildSystemPrompt() }])
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string; loading?: boolean }[]>([
    { role: 'assistant', text: "Tell me what data you have and what you're trying to accomplish — I'll suggest which capability (or combination) fits." },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setMessages((prev) => [...prev, { role: 'user', text }])
    historyRef.current.push({ role: 'user', content: text })
    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'assistant', text: 'Thinking…', loading: true }])

    try {
      const result = await proxyFetch<{ reply?: string }>('/proxy/openai/chat', { api_key: apiKey, messages: historyRef.current })
      const reply = result.reply || '(empty response)'
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', text: reply }])
      historyRef.current.push({ role: 'assistant', content: reply })
    } catch (err) {
      const msg = `Couldn't reach the advisor: ${err instanceof Error ? err.message : String(err)}`
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', text: msg }])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div ref={threadRef} className="flex max-h-[320px] flex-col gap-2.5 overflow-y-auto pr-0.5">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
            <div
              className={`max-w-[82%] rounded-[14px] px-[13px] py-[9px] text-[12.5px] leading-[1.55] [white-space:pre-wrap] ${
                m.role === 'user'
                  ? 'rounded-br-[4px] bg-brand-violet text-white'
                  : `rounded-bl-[4px] bg-surface-muted text-ink-primary ${m.loading ? 'italic text-ink-muted' : ''}`
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          placeholder="e.g. I have 2 years of weekly sell-out by SKU and store, and I want to know how much stock to hold next quarter…"
          className="min-h-10 max-h-[100px] flex-1 resize-none rounded-[var(--r-md)] border border-border-default bg-surface-card px-3 py-2 text-[13px] text-ink-primary outline-none focus:border-brand-violet focus:shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
        />
        <button
          onClick={send}
          disabled={sending}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] bg-brand-violet text-white disabled:opacity-50 [&_svg]:h-[17px] [&_svg]:w-[17px]"
        >
          <Icon name="arrowRight" />
        </button>
      </div>
      <button onClick={onReset} className="flex items-center gap-1 self-start text-[11px] text-ink-muted hover:text-brand-violet [&_svg]:h-3 [&_svg]:w-3">
        <Icon name="x" /> Forget API key &amp; reset
      </button>
    </>
  )
}
