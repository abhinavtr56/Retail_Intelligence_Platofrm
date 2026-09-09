import type { NodeDetail, OrchNode } from '../../types/orchestration'

/** Agents whose two bars are a genuine like-for-like comparison, in the order
 *  (subject, benchmark).
 *
 *  Benchmarking draws "this promotion" against "the channel average";
 *  Effectiveness draws "this mechanic here" against "the same mechanic across
 *  the whole business". Both read subject-first, so one formula serves them.
 *
 *  DELIBERATELY NOT THE OTHER FOUR. Optimization's bars are a ranking of
 *  regions, and Risk's and Diagnostics' are "Trade Spend" against "At Stake" —
 *  two different quantities. A change between either pair is not a change in
 *  anything. Cannibalization is excluded for the opposite reason: its bars run
 *  (expected, actual), so this formula would report its sign backwards, and it
 *  already binds its node to the tool's own computed figure — see
 *  cannibalizationNode.ts.
 */
const COMPARISON_AGENTS = new Set(['benchmark', 'mechanic_efficiency'])

/** The subject against its benchmark, as a RELATIVE percentage change.
 *
 *  The model wrote this field as free text and was inconsistent about it:
 *  across the recorded runs it gave the point difference 86% of the time, a
 *  relative percentage 6%, and neither 7% — all of it labelled "%". A point
 *  difference wearing a percent sign is the wrong reading, so where the bars
 *  support it the figure is computed here instead: 43.1 against 47.6 is -9.5%,
 *  not the "-4.5%" the model reported, which was 4.5 percentage points.
 */
export function bindComparisonDelta(
  nodes: OrchNode[],
  nodeDetails: Record<string, NodeDetail>,
): OrchNode[] {
  return nodes.map((n) => {
    if (!COMPARISON_AGENTS.has(n.key)) return n
    const items = nodeDetails[n.key]?.viz?.items
    if (!items || items.length < 2) return n

    const subject = items[0]?.value
    const benchmark = items[1]?.value
    if (
      typeof subject !== 'number' ||
      typeof benchmark !== 'number' ||
      !Number.isFinite(subject) ||
      !Number.isFinite(benchmark) ||
      benchmark === 0
    ) {
      return n
    }

    // Divided by the BENCHMARK's magnitude, so a negative benchmark cannot
    // invert the sign of the comparison.
    const pct = ((subject - benchmark) / Math.abs(benchmark)) * 100
    const rounded = Math.round(pct * 10) / 10
    return {
      ...n,
      delta: `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`,
      trend: rounded < 0 ? ('down' as const) : rounded > 0 ? ('up' as const) : ('' as const),
    }
  })
}
