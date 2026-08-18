import type { HTMLAttributes, ReactNode } from 'react'

// Ported from css/components.css .card / .card-hd / .card-bd / .card-ft
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[var(--r-lg)] border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)] ${className}`}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 ${className}`}
    >
      <div>
        <h3 className="text-[15px] font-bold">{title}</h3>
        {subtitle && <div className="mt-0.5 text-xs text-ink-muted">{subtitle}</div>}
      </div>
      {actions}
    </div>
  )
}

export function CardBody({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-5 ${className}`} {...props} />
}

export function CardFooter({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-t border-border-subtle px-5 py-3 ${className}`} {...props} />
}
