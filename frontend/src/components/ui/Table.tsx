import type { TdHTMLAttributes, ThHTMLAttributes, HTMLAttributes } from 'react'

// Ported from css/pages.css .table / .table th / .table td / .cell-title
export function Table({ className = '', ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={`w-full border-collapse ${className}`} {...props} />
}

export function Th({ className = '', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`border-b border-border-subtle bg-surface-muted p-[12px_18px] text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted ${className}`}
      {...props}
    />
  )
}

export function Td({
  emphasis,
  className = '',
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { emphasis?: boolean }) {
  return (
    <td
      className={`border-b border-border-subtle p-[12px_18px] text-[13px] group-last/row:border-b-0 ${
        emphasis ? 'font-semibold text-ink-primary' : ''
      } ${className}`}
      {...props}
    />
  )
}

export function Tr({ className = '', ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`group/row cursor-pointer transition-colors duration-100 last:border-b-0 hover:bg-surface-hover ${className}`}
      {...props}
    />
  )
}
