import { useEffect, useState } from 'react'

// Ported from js/pages/simulation.js's `showLoadingOverlay` + css/tpo.css
// .sim-loading-*. Plays through `stages` over `duration`ms, then calls onDone.
export function LoadingOverlay({
  active,
  title,
  stages,
  duration = 5000,
  onDone,
}: {
  active: boolean
  title: string
  stages: string[]
  duration?: number
  onDone: () => void
}) {
  const [stageIdx, setStageIdx] = useState(0)

  useEffect(() => {
    if (!active) return
    setStageIdx(0)
    const stageMs = duration / stages.length
    const timers: number[] = []
    stages.forEach((_, i) => {
      timers.push(window.setTimeout(() => setStageIdx(i), i * stageMs))
    })
    timers.push(window.setTimeout(onDone, duration + 240))
    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, duration, stages.length])

  if (!active) return null

  const pct = ((stageIdx + 1) / stages.length) * 100

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-[rgba(15,23,42,0.42)] backdrop-blur-[4px]">
      <div className="w-[min(420px,92vw)] rounded-[18px] bg-white p-[30px_40px] text-center shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35),0_0_0_1px_rgba(124,92,255,0.18)]">
        <div className="mx-auto mb-[18px] h-11 w-11 animate-spin rounded-full border-[3px] border-[rgba(124,92,255,0.18)] border-t-brand-violet" />
        <div className="mb-1.5 text-base font-bold text-ink-primary">{title}</div>
        <div className="mb-4 min-h-[18px] text-[13px] text-ink-muted">{stages[stageIdx]}</div>
        <div className="h-1.5 overflow-hidden rounded-[999px] bg-[rgba(124,92,255,0.12)]">
          <div
            className="h-full rounded-[999px] bg-[linear-gradient(90deg,#7C5CFF,#4F7CFF)] transition-[width] duration-[360ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
