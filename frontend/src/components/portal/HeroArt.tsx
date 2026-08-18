// Ported verbatim from js/portal.js's heroArt().
export function HeroArt() {
  return (
    <svg width="176" height="112" viewBox="0 0 176 112" fill="none" aria-hidden="true">
      <path d="M6 92 h140" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="1 6" strokeLinecap="round" />
      <circle cx="6" cy="92" r="4.5" fill="var(--brand-violet)" />
      <rect x="26" y="72" width="10" height="20" rx="2" fill="var(--brand-blue)" opacity="0.35" />
      <rect x="42" y="60" width="10" height="32" rx="2" fill="var(--brand-blue)" opacity="0.55" />
      <rect x="58" y="46" width="10" height="46" rx="2" fill="var(--brand-blue)" opacity="0.8" />
      <rect x="74" y="30" width="10" height="62" rx="2" fill="var(--brand-violet)" />
      <polyline
        points="26,72 42,60 58,46 74,30"
        fill="none"
        stroke="var(--status-success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="74" cy="30" r="4" fill="var(--status-success)" />
      <circle cx="136" cy="42" r="24" fill="none" stroke="var(--brand-violet-50)" strokeWidth="9" />
      <circle
        cx="136"
        cy="42"
        r="24"
        fill="none"
        stroke="var(--brand-violet)"
        strokeWidth="9"
        strokeDasharray="112 151"
        strokeLinecap="round"
        transform="rotate(-90 136 42)"
      />
    </svg>
  )
}
