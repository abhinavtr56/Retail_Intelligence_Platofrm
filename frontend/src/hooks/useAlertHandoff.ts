import { useNavigate } from 'react-router-dom'
import { useCommandFilters } from '../store/commandFilters'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { ASK_WHY_STATE_KEY, buildAskWhyIntent } from '../lib/askWhy'
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
 *
 *  TWO CONSUMERS, ONE CLICK. The scope above is what the Simulation Studio
 *  reads, so its Current Plan describes the population that was clicked. The
 *  Investigations page reads neither the store nor the filters — it takes the
 *  composed question from router state (lib/askWhy) — so the hand-off carries
 *  that too. Sending only one of the pair leaves the other page guessing: the
 *  RCA falls back to a blank prompt, or Simulation answers for the whole
 *  promotion instead of the one SKU in the alert.
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
    // `week` is this payload's name for the period; without it the question
    // loses its timeframe.
    const intent = buildAskWhyIntent({
      promotion: alert.title?.split('—').pop()?.trim() ?? alert.title,
      product: alert.product,
      channel: alert.channel,
      period: alert.week,
      roi_pct: alert.roi_pct,
      title: alert.title,
      description: alert.description,
    })
    navigate('/investigations', { state: { [ASK_WHY_STATE_KEY]: intent } })
  }
}
