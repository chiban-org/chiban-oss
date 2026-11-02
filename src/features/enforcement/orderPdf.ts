import type { CeaseAndDesistRule, OrderContentField } from '@packs/nh/schema'
import {
  NOTICE_OF_VIOLATION_INTRO,
  NOTICE_OF_VIOLATION_REQUEST,
  ORDER_CEASE_SENTENCE,
  ORDER_LIEN_WARNING,
  ORDER_MOTION_NOTICE,
} from '@packs/nh/starters/enforcementTemplates'
import type { violationFindings } from '@/db/schema'
import { PROVISION_KIND_LABELS } from '@/features/enforcement/labels'
import { type PdfBlock, renderPdf } from '@/features/pdf/renderPdf'
import { formatCivilDate } from '@/lib/formatDate'

type Finding = typeof violationFindings.$inferSelect

export interface OrderPdfInput {
  townName: string
  number: string
  rule: CeaseAndDesistRule
  locationText: string
  findings: Finding[]
  correctiveAction: string
  correctiveDeadline: string | null
  ceaseImmediately: boolean
  issuedOn: string
  issuerName: string
  issuerTitle: string
}

const provisionLines = (findings: Finding[]) =>
  findings.map((f) => `${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`)

export function missingOrderContent(
  rule: CeaseAndDesistRule,
  input: Pick<OrderPdfInput, 'findings' | 'correctiveAction' | 'correctiveDeadline'>,
): OrderContentField[] {
  const present: Record<OrderContentField, boolean> = {
    provisions: input.findings.length > 0 && input.findings.every((f) => f.provisionRef !== ''),
    facts: input.findings.length > 0 && input.findings.every((f) => f.facts !== ''),
    inspectionDate:
      input.findings.length > 0 && input.findings.every((f) => f.inspectionDate !== ''),
    correctiveAction: input.correctiveAction.trim() !== '',
    correctiveDeadline: input.correctiveDeadline !== null,
    motionNotice: true,
    lienWarning: true,
  }
  return rule.contentFields.filter((field) => !present[field])
}

export async function renderOrderPdf(input: OrderPdfInput): Promise<Uint8Array> {
  const wants = (field: OrderContentField) => input.rule.contentFields.includes(field)
  const blocks: PdfBlock[] = [
    {
      kind: 'fields',
      rows: [
        { label: 'Order number', value: input.number },
        { label: 'Property', value: input.locationText },
        { label: 'Issued', value: formatCivilDate(input.issuedOn) },
        { label: 'Authority', value: input.rule.citation.label },
      ],
    },
  ]
  if (input.ceaseImmediately) blocks.push({ kind: 'notice', text: ORDER_CEASE_SENTENCE })
  if (wants('provisions')) {
    blocks.push({ kind: 'heading', text: 'Provisions violated' })
    for (const line of provisionLines(input.findings))
      blocks.push({ kind: 'paragraph', text: line })
  }
  if (wants('facts')) {
    blocks.push({ kind: 'heading', text: 'Facts' })
    for (const f of input.findings) blocks.push({ kind: 'paragraph', text: f.facts })
  }
  if (wants('inspectionDate')) {
    blocks.push({ kind: 'heading', text: 'Date of inspection' })
    for (const date of new Set(input.findings.map((f) => f.inspectionDate))) {
      blocks.push({ kind: 'paragraph', text: formatCivilDate(date) })
    }
  }
  if (wants('correctiveAction')) {
    blocks.push({ kind: 'heading', text: 'Corrective action required' })
    blocks.push({ kind: 'paragraph', text: input.correctiveAction })
  }
  if (wants('correctiveDeadline') && input.correctiveDeadline !== null) {
    blocks.push({ kind: 'heading', text: 'Corrective action due' })
    blocks.push({ kind: 'paragraph', text: formatCivilDate(input.correctiveDeadline) })
  }
  if (wants('motionNotice')) {
    blocks.push({ kind: 'heading', text: 'Notice of motion to enforce' })
    blocks.push({ kind: 'paragraph', text: ORDER_MOTION_NOTICE })
  }
  if (wants('lienWarning')) {
    blocks.push({ kind: 'heading', text: 'Lien warning' })
    blocks.push({ kind: 'paragraph', text: ORDER_LIEN_WARNING })
  }
  blocks.push({
    kind: 'fields',
    rows: [{ label: 'Issued by', value: `${input.issuerName}, ${input.issuerTitle}` }],
  })
  blocks.push({ kind: 'signature', label: 'Enforcement officer signature' })
  return await renderPdf({
    title: 'Cease and desist order',
    subtitle: input.number,
    townName: input.townName,
    scale: 'document',
    blocks,
  })
}

export interface NoticePdfInput {
  townName: string
  caseNumber: string
  locationText: string
  findings: Finding[]
  sentOn: string
}

export async function renderNoticePdf(input: NoticePdfInput): Promise<Uint8Array> {
  const blocks: PdfBlock[] = [
    { kind: 'paragraph', text: NOTICE_OF_VIOLATION_INTRO },
    {
      kind: 'fields',
      rows: [
        { label: 'Case', value: input.caseNumber },
        { label: 'Property', value: input.locationText },
        { label: 'Sent', value: formatCivilDate(input.sentOn) },
      ],
    },
    { kind: 'heading', text: 'Provisions' },
    ...provisionLines(input.findings).map((text): PdfBlock => ({ kind: 'paragraph', text })),
    { kind: 'heading', text: 'What was found' },
    ...input.findings.map(
      (f): PdfBlock => ({
        kind: 'paragraph',
        text: `${f.facts} (inspected ${formatCivilDate(f.inspectionDate)})`,
      }),
    ),
    { kind: 'paragraph', text: NOTICE_OF_VIOLATION_REQUEST },
  ]
  return await renderPdf({
    title: 'Notice of violation',
    subtitle: input.caseNumber,
    townName: input.townName,
    scale: 'document',
    blocks,
  })
}
