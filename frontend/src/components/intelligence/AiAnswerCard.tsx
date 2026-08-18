import { Link } from 'react-router-dom'
import { Card } from '../ui'
import { Icon } from '../../icons'
import { toneClass } from './answerFormat'
import { useStreamedAnswer } from './useStreamedAnswer'
import type { IntelligenceAnswer } from '../../types/intelligence'

// Ported from js/pages/intelligence.js's `.ai-answer-card` block. Source pills use our
// own icon set with distinct tints rather than porting the 5 custom brand SVG marks
// from brand-icons.js pixel-for-pixel — same "which systems fed this" information,
// much less bespoke artwork for a decorative footer.
const SOURCES: { label: string; icon: 'database' | 'barChart' | 'file' | 'shoppingCart' | 'history'; tint: string }[] = [
  { label: 'SAP S/4HANA', icon: 'database', tint: '#0FAAFF' },
  { label: 'NielsenIQ', icon: 'barChart', tint: '#000000' },
  { label: 'DMS', icon: 'file', tint: '#F97316' },
  { label: 'Retail Exec', icon: 'shoppingCart', tint: '#10B981' },
  { label: 'Promotion History', icon: 'history', tint: 'var(--brand-violet)' },
]

export function AiAnswerCard({ question, answer, streamKey }: { question: string; answer: IntelligenceAnswer; streamKey: string }) {
  const { paragraphs, done } = useStreamedAnswer(answer.text, streamKey)

  return (
    <Card className="fade-in mb-5">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-[16px_20px]">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold">Investigation Synthesis</h3>
          <div className="mt-0.5 text-xs text-ink-muted">{question}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3.5 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5 text-ink-secondary">
            <span className="inline-block h-[7px] w-[7px] animate-[aiPulseDot_1.8s_ease-in-out_infinite] rounded-full bg-status-success shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
            <strong className="font-bold text-status-success">{answer.confidence}%</strong> confidence
          </span>
          <span>{answer.summary}</span>
        </div>
      </div>

      <div className="min-h-[60px] p-5 text-[14.5px] leading-[1.65] text-ink-primary">
        {paragraphs.map((runs, pi) => (
          <p key={pi} className="mb-2.5 last:mb-0">
            {runs.map((r, ri) => (r.tone ? <strong key={ri} className={toneClass(r.tone)}>{r.text}</strong> : <span key={ri}>{r.text}</span>))}
            {!done && pi === paragraphs.length - 1 && (
              <span className="ml-0.5 inline-block h-[1em] w-2 animate-[aiCursorBlink_0.85s_steps(2,start)_infinite] rounded-[1px] bg-ink-primary align-text-bottom" />
            )}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle p-[12px_20px]">
        {SOURCES.map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-card py-[3px] pl-1 pr-2.5 text-[11px] font-semibold text-ink-secondary shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px]" style={{ background: s.tint, color: 'white' }}>
              <Icon name={s.icon} className="h-3 w-3" />
            </span>
            {s.label}
          </span>
        ))}
        <span className="flex-1" />
        <Link to="/investigations" className="text-xs font-semibold text-ink-primary hover:underline">
          View full investigation →
        </Link>
      </div>
    </Card>
  )
}
