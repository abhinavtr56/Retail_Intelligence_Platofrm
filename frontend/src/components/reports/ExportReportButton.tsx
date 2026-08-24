import { useNavigate } from 'react-router-dom'
import { Button, useToast } from '../ui'
import { Icon } from '../../icons'
import { useGenerateReport } from '../../hooks/useReportCenter'
import type { ReportModule } from '../../types/reportCenter'

/** THE ONE GENERATE CONTROL, used by every module that has a report.
 *
 *  IT DOES NOT DOWNLOAD ANYTHING. Clicking it generates a report into the TPO
 *  Intelligence Report Center and says so; the file is downloaded later, from the
 *  Reports page, by a person who explicitly asks for Excel or PDF. That is the
 *  whole shape of the workflow:
 *
 *      module -> Export Report -> stored in the Report Center
 *      Reports page -> Download Excel / Download PDF -> browser saves a file
 *
 *  A single button, not a format menu: both artifacts are produced and stored,
 *  and the choice of format belongs at the point of download rather than at the
 *  point of generation.
 *
 *  IT CLAIMS NOTHING IT DID NOT DO. The success toast fires only after the server
 *  confirms a READY report with artifacts behind it, and offers a link to it; a
 *  failure shows the server's own reason.
 *
 *  THE SCOPE IS RESOLVED AT CLICK TIME. `scope` and `options` are read through
 *  callbacks rather than captured props, so a report always reflects what the
 *  screen is showing at the moment the user asks for it — which is what makes
 *  "change a filter, generate again" produce a different report with no cache to
 *  invalidate.
 */
export function ExportReportButton({
  module,
  scope,
  options,
  currency,
  disabled,
  disabledReason,
  label = 'Export Report',
}: {
  module: ReportModule
  /** Read at click time — see the note above. */
  scope: () => Record<string, unknown>
  options?: () => Record<string, unknown>
  currency?: string
  /** Set when the screen has nothing to report on yet. */
  disabled?: boolean
  disabledReason?: string
  label?: string
}) {
  const { show } = useToast()
  const navigate = useNavigate()
  const generate = useGenerateReport()

  const run = () => {
    if (generate.isPending) return
    generate.mutate(
      { module, scope: scope(), options: options?.() ?? {}, currency },
      {
        // ONE toast, and NO navigation. The brief is explicit that generating
        // must not force the user off the module they are working in, so the
        // follow-up is offered as the "View Report" button that appears beside
        // this one rather than taken for them.
        onSuccess: (report) =>
          show(
            `Report generated successfully — ${report.name}. Open Reports to download it.`,
            { duration: 7000 },
          ),
        onError: (error) =>
          show(
            `Unable to generate report. ${error.message}`,
            // The shared Toast offers 'success' and 'info' only; a failure is not
            // given a new variant here, so the MESSAGE carries the failure and is
            // held on screen longer than a success.
            { variant: 'info', duration: 8000 },
          ),
      },
    )
  }

  if (disabled) {
    return (
      <Button variant="secondary" disabled title={disabledReason}>
        <Icon name="download" /> <span>{label}</span>
      </Button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        onClick={run}
        disabled={generate.isPending}
        className="cursor-pointer"
        title="Generate this view as a report and store it in the Report Center"
      >
        <Icon name="download" />
        <span>{generate.isPending ? 'Generating…' : label}</span>
      </Button>
      {generate.isSuccess && (
        <Button
          variant="secondary"
          onClick={() => navigate('/reports')}
          className="cursor-pointer"
          title="Open the Report Center"
        >
          <Icon name="arrowRight" /> <span>View Report</span>
        </Button>
      )}
    </span>
  )
}
