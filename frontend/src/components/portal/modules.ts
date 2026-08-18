import type { PortalModule } from '../../types/portal'

// Ported verbatim from js/portal.js's MODULES catalog — TPO is the only live module.
export const MODULES: PortalModule[] = [
  {
    key: 'forecasting',
    title: 'Demand & Sales Forecasting Intelligence',
    desc: 'Forecast demand, sell-out and sell-in across SKUs, stores and channels.',
    icon: 'trending',
    tint: 'sky',
    live: false,
  },
  {
    key: 'tpo',
    title: 'Trade Promotion Optimization (TPO)',
    desc: 'Diagnose promotion ROI, run root-cause analysis and simulate what-if scenarios before you spend.',
    icon: 'sparkles',
    tint: 'lavender',
    live: true,
    href: '/command',
  },
  {
    key: 'mmm',
    title: 'Market Mix & Marketing Intelligence (MMM)',
    desc: "Attribute revenue across trade, media and price to guide next quarter's marketing mix.",
    icon: 'flow',
    tint: 'teal',
    live: false,
  },
  {
    key: 'pricing',
    title: 'Assortment & Pricing Intelligence',
    desc: 'Right-size the range and price ladder by store cluster, channel and region.',
    icon: 'pricing',
    tint: 'peach',
    live: false,
  },
  {
    key: 'customer',
    title: 'Customer & Channel Intelligence',
    desc: 'Segment retailers and shoppers to target investment where it actually converts.',
    icon: 'users',
    tint: 'mint',
    live: false,
  },
  {
    key: 'supply',
    title: 'Supply, Inventory & Network Intelligence',
    desc: 'Track stock cover, fill rate and network health feeding every promotion decision.',
    icon: 'inventory',
    tint: 'sky',
    live: false,
  },
]
