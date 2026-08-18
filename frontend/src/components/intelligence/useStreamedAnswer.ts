import { useEffect, useRef, useState } from 'react'
import { parseSegments, type Segment } from './answerFormat'

// Ported from js/pages/intelligence.js's `_streamAnswer` — types the AI synthesis in
// character-by-character with tone-aware runs and punctuation-aware pacing. Streams
// once per investigation type per session (module-level Set, mirrors the original's
// `window._intelAnswerStreamed` global) — revisiting the tab replays instantly instead
// of re-typing.
const streamedOnce = new Set<string>()

export function useStreamedAnswer(text: string, streamKey: string) {
  const finalParagraphs = buildParagraphs(parseSegments(text))
  const alreadyStreamed = streamedOnce.has(streamKey)

  const [paragraphs, setParagraphs] = useState<Segment[][]>(alreadyStreamed ? finalParagraphs : [[]])
  const [done, setDone] = useState(alreadyStreamed)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (streamedOnce.has(streamKey)) {
      setParagraphs(buildParagraphs(parseSegments(text)))
      setDone(true)
      return
    }

    const charSeq: ({ ch: string; tone: Segment['tone'] } | { br: true })[] = []
    parseSegments(text).forEach((s) => {
      if (s.text === '\n') {
        charSeq.push({ br: true })
        return
      }
      for (const ch of s.text) charSeq.push({ ch, tone: s.tone })
    })

    const paras: Segment[][] = [[]]
    let idx = 0
    setParagraphs([[]])
    setDone(false)

    const tick = () => {
      if (idx >= charSeq.length) {
        streamedOnce.add(streamKey)
        setDone(true)
        return
      }
      const item = charSeq[idx]
      if ('br' in item) {
        paras.push([])
      } else {
        const runs = paras[paras.length - 1]
        const last = runs[runs.length - 1]
        if (last && last.tone === item.tone) last.text += item.ch
        else runs.push({ text: item.ch, tone: item.tone })
      }
      setParagraphs(paras.map((p) => p.map((r) => ({ ...r }))))
      idx++

      let delay: number
      const ch = 'ch' in item ? item.ch : ''
      if ('br' in item) delay = 220
      else if (ch === '.' || ch === '?' || ch === '!') delay = 140
      else if (ch === ',' || ch === '—' || ch === ':') delay = 70
      else delay = 14 + Math.random() * 14
      timer.current = window.setTimeout(tick, delay)
    }
    timer.current = window.setTimeout(tick, 420)

    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey, text])

  return { paragraphs, done }
}

function buildParagraphs(segments: Segment[]): Segment[][] {
  const paras: Segment[][] = [[]]
  segments.forEach((s) => {
    if (s.text === '\n') paras.push([])
    else paras[paras.length - 1].push(s)
  })
  return paras
}
