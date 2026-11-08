import { env } from '@/config/env'
import type { MailAttachment, MailMessage } from '@/features/mail/transport'
import type { ReportRange } from '@/features/reports/range'
import { censusPeriodOf, type ExportReportKey, reportTitle } from '@/features/reports/reportExport'
import { periodLabel, type ScheduleFrequency } from '@/features/reports/schedulePeriod'
import { formatCivilDate } from '@/lib/formatDate'

export interface ScheduleMailInput {
  to: string
  report: ExportReportKey
  frequency: ScheduleFrequency
  range: ReportRange
  attachments: MailAttachment[]
  incomplete?: string
}

export function reportPageHref(report: ExportReportKey, range: ReportRange): string {
  if (report === 'cash-receipts')
    return `${env.BASE_URL}/staff/reports/cash-receipts?date=${range.to}`
  if (report === 'census') {
    const period = censusPeriodOf(range)
    const month = period?.month ?? 'year'
    return `${env.BASE_URL}/staff/reports/census?year=${period?.year ?? range.from.slice(0, 4)}&month=${month}`
  }
  return `${env.BASE_URL}/staff/reports?from=${range.from}&to=${range.to}`
}

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export function scheduledReportMail(input: ScheduleMailInput): MailMessage {
  const title = reportTitle(input.report)
  const dates = `${formatCivilDate(input.range.from)} to ${formatCivilDate(input.range.to)}`
  const body =
    input.incomplete === undefined
      ? `Your scheduled ${title} report for ${dates} is attached as a CSV file and an Excel workbook.`
      : `Your scheduled ${title} report for ${dates} is not attached. ${input.incomplete} before it can be sent. Classify them on the report page and download it there.`
  const footer =
    'You get this because staff scheduled this report for you in Chiban. Anyone who can see reports can pause or change it under Reports, Scheduled reports.'
  const href = reportPageHref(input.report, input.range)
  return {
    to: input.to,
    subject: `${title}: ${periodLabel(input.frequency, input.range)}`,
    text: `${body}\n\nOpen the report: ${href}\n\n${footer}\n`,
    html: `<p>${escape(body)}</p><p><a href="${href}">Open the report</a></p><p>${escape(footer)}</p>`,
    attachments: input.attachments,
  }
}
