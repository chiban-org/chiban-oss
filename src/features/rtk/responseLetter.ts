import { NH_RTK_EXEMPTIONS, OTHER_LAW_EXEMPTION_KEY } from '@packs/nh/rtkExemptions'
import { asc, eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import {
  documents,
  rtkReleaseItems,
  rtkReleases,
  rtkRequests,
  rtkTimeStatements,
  rtkWithholdings,
} from '@/db/schema'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { PdfBlock } from '@/features/pdf/renderPdf'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

type Withholding = typeof rtkWithholdings.$inferSelect

export function exemptionLabel(w: Pick<Withholding, 'exemptionKey' | 'otherCitation'>): {
  label: string
  citation: string
} {
  if (w.exemptionKey === OTHER_LAW_EXEMPTION_KEY) {
    return { label: 'Made confidential by another law', citation: w.otherCitation ?? '' }
  }
  const found = NH_RTK_EXEMPTIONS.find((e) => e.key === w.exemptionKey)
  return { label: found?.label ?? w.exemptionKey, citation: found?.citation.label ?? '' }
}

const RELEASE_METHOD_LABELS: Record<(typeof rtkReleases.$inferSelect)['method'], string> = {
  inspection: 'Inspection at the town office',
  paper: 'Paper copy',
  electronic_link: 'Link sent by email',
  email: 'Email attachment',
}

const KIND_SENTENCES: Record<string, string> = {
  made_available: 'The records you requested are available to you.',
  website_reference: 'The records you requested are posted on the town website.',
  denied: 'The town cannot provide some or all of the records you requested.',
  time_statement: 'The town needs more time to respond to your request.',
}

function withholdingBlocks(withholdings: Withholding[]): PdfBlock[] {
  if (withholdings.length === 0) return []
  return [
    {
      kind: 'table',
      columns: ['Record', 'Exemption', 'Explanation'],
      rows: withholdings.map((w) => {
        const e = exemptionLabel(w)
        return [
          `${w.recordDescription}${w.scope === 'redacted' ? ' (redacted)' : ''}`,
          `${e.label} (${e.citation})`,
          w.explanation,
        ]
      }),
    },
  ]
}

type Request = typeof rtkRequests.$inferSelect
type TimeStatement = typeof rtkTimeStatements.$inferSelect

function responseBlocks(request: Request): PdfBlock[] {
  const kind = request.firstResponseKind
  const blocks: PdfBlock[] = []
  if (kind !== null) blocks.push({ kind: 'paragraph', text: KIND_SENTENCES[kind] ?? '' })
  if (request.deniedOn !== null && kind !== 'denied') {
    blocks.push({ kind: 'paragraph', text: KIND_SENTENCES.denied ?? '' })
  }
  if (kind === 'website_reference' && request.firstResponseUrl !== null) {
    blocks.push({
      kind: 'fields',
      rows: [{ label: 'Web address', value: request.firstResponseUrl }],
    })
  }
  return blocks
}

function statementBlocks(statements: TimeStatement[]): PdfBlock[] {
  const blocks: PdfBlock[] = []
  for (const s of statements) {
    blocks.push({ kind: 'heading', text: 'Time the town needs' })
    blocks.push({
      kind: 'fields',
      rows: [
        { label: 'Statement made', value: formatCivilDate(s.statedOn) },
        { label: 'Response by', value: formatCivilDate(s.statedDate) },
        { label: 'Reason', value: s.delayReason },
      ],
    })
    if (s.costEstimate.length > 0) {
      blocks.push({
        kind: 'table',
        columns: ['Estimated charge', 'Amount'],
        rows: [
          ...s.costEstimate.map((c) => [c.label, formatCents(c.cents)]),
          ['Total', formatCents(s.costEstimate.reduce((sum, c) => sum + c.cents, 0))],
        ],
      })
    }
  }
  return blocks
}

async function releasedBlocks(db: DbOrTx, requestId: string): Promise<PdfBlock[]> {
  const released = await db
    .select({
      sequence: rtkReleases.sequence,
      releasedOn: rtkReleases.releasedOn,
      method: rtkReleases.method,
      title: documents.title,
    })
    .from(rtkReleaseItems)
    .innerJoin(rtkReleases, eq(rtkReleases.id, rtkReleaseItems.releaseId))
    .innerJoin(documents, eq(documents.id, rtkReleaseItems.documentId))
    .where(eq(rtkReleases.requestId, requestId))
    .orderBy(asc(rtkReleases.sequence), asc(rtkReleaseItems.position))
  if (released.length === 0) return []
  return [
    {
      kind: 'table',
      columns: ['Release', 'Date', 'How', 'Record'],
      rows: released.map((r) => [
        String(r.sequence),
        formatCivilDate(r.releasedOn),
        RELEASE_METHOD_LABELS[r.method],
        r.title,
      ]),
    },
  ]
}

export async function responseLetterInput(
  db: DbOrTx,
  requestId: string,
  signal: AbortSignal,
): Promise<DocumentInput> {
  signal.throwIfAborted()
  const [request] = await db.select().from(rtkRequests).where(eq(rtkRequests.id, requestId))
  if (request === undefined) {
    throw new AppError(ErrorIds.RTK_INVARIANT, 'No such request for a response letter', {
      requestId,
    })
  }
  const statements = await db
    .select()
    .from(rtkTimeStatements)
    .where(eq(rtkTimeStatements.requestId, requestId))
    .orderBy(asc(rtkTimeStatements.statedOn))
  const withholdings = await db
    .select()
    .from(rtkWithholdings)
    .where(eq(rtkWithholdings.requestId, requestId))
    .orderBy(asc(rtkWithholdings.createdAt))
  return {
    subtitle: request.number,
    frame: await documentFrame(db, {}, signal),
    context: {
      values: {
        'rtk.number': request.number,
        'rtk.receivedOn': formatCivilDate(request.receivedOn),
        'rtk.description': request.description,
      },
      sections: new Map([
        ['rtk.response', responseBlocks(request)],
        ['rtk.timeStatements', statementBlocks(statements)],
        ['rtk.released', await releasedBlocks(db, requestId)],
        ['rtk.withheld', withholdingBlocks(withholdings)],
      ]),
    },
  }
}

export async function buildResponseLetter(
  db: DbOrTx,
  requestId: string,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const input = await responseLetterInput(db, requestId, signal)
  const template = await publishedTemplate(db, 'rtk_response', signal)
  return await renderDocumentOrDefault('rtk_response', template, input)
}
