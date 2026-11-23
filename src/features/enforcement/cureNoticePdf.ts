import type { Tx } from '@/db/client'
import type { CureRecipientRole, violationFindings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import { attachDocument } from '@/features/documents/attach'
import { cureLinks, cureMethodPhrase } from '@/features/enforcement/cureRules'
import { CURE_RECIPIENT_LABELS, PROVISION_KIND_LABELS } from '@/features/enforcement/labels'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { loadPack } from '@/features/packs/loadPack'
import type { CureNoticeRule } from '@/features/packs/schema'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { DocumentFrame } from '@/features/pdf/frame'
import { type PdfBlock, renderPdf } from '@/features/pdf/renderPdf'
import type { ObjectStore } from '@/features/storage/objectStore'
import { formatCivilDate } from '@/lib/formatDate'

type Finding = typeof violationFindings.$inferSelect

export interface CureNoticeRecipient {
  role: CureRecipientRole
  name: string
  mailingAddress: string
}

export interface CureNoticePdfInput {
  frame: DocumentFrame
  caseNumber: string
  locationText: string
  findings: Finding[]
  recipient: CureNoticeRecipient
  sentOn: string
  rule: CureNoticeRule
  cureDue: Pick<SubjectDue, 'due'>
}

const paragraph = (text: string): PdfBlock => ({ kind: 'paragraph', text })

export async function renderCureNoticePdf(input: CureNoticePdfInput): Promise<Uint8Array> {
  const { rule, recipient } = input
  const consequence = cureLinks(loadPack(), rule).cure.consequence.text
  const blocks: PdfBlock[] = [
    {
      kind: 'fields',
      rows: [
        { label: CURE_RECIPIENT_LABELS[recipient.role], value: recipient.name },
        { label: 'Mailing address', value: recipient.mailingAddress },
        { label: 'Case', value: input.caseNumber },
        { label: 'Property', value: input.locationText },
        {
          label: 'Mailed',
          value: `${formatCivilDate(input.sentOn)}, ${cureMethodPhrase(rule)}`,
        },
        { label: 'Authority', value: rule.citation.label },
      ],
    },
    { kind: 'heading', text: 'Provisions' },
    ...input.findings.map((f) =>
      paragraph(`${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`),
    ),
    { kind: 'heading', text: 'What was found' },
    ...input.findings.map((f) =>
      paragraph(`${f.facts} (inspected ${formatCivilDate(f.inspectionDate)})`),
    ),
    paragraph(`Correct the violation by ${formatCivilDate(input.cureDue.due)}.`),
    paragraph(consequence),
  ]
  return await renderPdf({
    title: rule.label,
    subtitle: input.caseNumber,
    frame: input.frame,
    scale: 'document',
    blocks,
  })
}

export interface CureLetterInput {
  caseId: string
  caseNumber: string
  locationText: string
  findings: Finding[]
  rule: CureNoticeRule
  sentOn: string
  cureDue: Pick<SubjectDue, 'due'>
  recipients: readonly CureNoticeRecipient[]
}

export interface CureLetterContext {
  store: ObjectStore
  actor: Actor
  signal: AbortSignal
}

export async function attachCureLetters(
  tx: Tx,
  { store, actor, signal }: CureLetterContext,
  { recipients, ...letter }: CureLetterInput,
): Promise<string[]> {
  const frame = await documentFrame(tx, {}, signal, store)
  const documentIds: string[] = []
  for (const recipient of recipients) {
    const bytes = await renderCureNoticePdf({ ...letter, frame, recipient })
    const stored = await storeGeneratedBytes(tx, store, bytes, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'enforcement_case', id: letter.caseId },
        title: `Cure notice to the ${recipient.role} for ${letter.caseNumber}`,
        docKind: 'enforcement_letter',
        file: {
          sha256: stored.sha256,
          filename: `${letter.caseNumber}-cure-notice-${recipient.role}.pdf`,
          contentType: 'application/pdf',
        },
      },
      signal,
    )
    documentIds.push(attached.documentId)
  }
  return documentIds
}
