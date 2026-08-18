import { useLayoutEffect, useRef, useState } from 'react'

// The vanilla charts (js/components/charts.js) measured `host.clientWidth` once at
// mount and never again. We do the same but also track a ResizeObserver so charts
// stay correct across sidebar collapse / viewport resize instead of going stale.
export function useChartWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || fallback)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ref, width }
}
