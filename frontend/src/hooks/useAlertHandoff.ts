import { useNavigate } from 'react-router-dom'
import { useCommandFilters } from '../store/commandFilters'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import type { RiskAlert } from '../types/commandCenter'

/** THE COMMAND CENTER -> RCA HAND-OFF for a risk alert (B3.2).
 *
 *  EXTRACTED, NOT REWRITTEN. This is the function that lived in
 *  `pages/CommandCenter.tsx`, moved verbatim so the notification bell in the
 *  Topbar can open the SAME investigation the Command Center's own alert rows
 *  open. A second copy in the header would be a second RCA flow, free to drift
 *  from the first about what scope it hands over.
 *
 *  These call sites already held the clicked entity and threw it away,
 *  navigating with nothing. They hand over the Command Center's own validated
 *  FilterState, narrowed only by identifiers the source ACTUALLY provides.
 *
 *  A RISK ALERT CARRIES THE EVENT'S CODES — promotion, product and channel —
 *  so all three narrow the scope. That is what makes a row's ROI and the
 *  Simulation Studio's Current Plan describe the same population: a -3.6%
 *  alert is one SKU in one channel, and handing over an unnarrowed selection
 *  made Simulation answer for the whole promotion instead.
 *
 *  THE WEEK IS A LABEL AND STAYS ONE. It identifies the event but cannot scope
 *  it: Incremental Sales is measured against the non-promoted rows of the
 *  selection, the promoted week has none, and a week-narrowed scope reports
 *  -100% instead of the row's own ROI. Display names ("Modern Trade", not
 *  "CH002") likewise stay in `labels` — turning one back into a code by
 *  guessing would select different rows from the ones clicked.
 *
 *  Nothing here recomputes anything, and the Command Center's own filter state
 *  is not mutated — the hand-off is a copy.
 */
export function useAlertHandoff(): (alert: RiskAlert) => void {
  const navigate = useNavigate()
  // Read-only. The Command Center's own filter state is never written here.
  const filters = useCommandFilters((s) => s.filters)
  const startFromCommandCenter = useActiveInvestigationStore((s) => s.startFromCommandCenter)

  return (alert: RiskAlert) => {
    startFromCommandCenter({
      origin: 'risk_alert',
      label: alert.title,
      filters: {
        ...filters,
        promotion: [alert.promotion_id],
        product: [alert.product_id],
        channel: [alert.channel_id],
      },
      identifiers: {
        promotion_id: alert.promotion_id,
        product_id: alert.product_id,
        channel_id: alert.channel_id,
      },
      labels: { product: alert.product, channel: alert.channel, week: alert.week },
    })
    navigate('/investigations')
  }
}
