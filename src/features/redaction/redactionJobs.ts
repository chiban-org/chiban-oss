import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import {
  documents,
  documentVersions,
  REDACTION_PURPOSES,
  redactionBoxes,
  redactionJobs,
  rtkRequests,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { ImageBox, PdfBox } from '@/features/redaction/types'
import { validateWithholdingText } from '@/features/rtk/withholdings'
import { err, ok, type Result } from '@/types/result'

export type RedactionBoxInput = ({ pdf: PdfBox } | { image: ImageBox }) & {
  exemptionKey: string
  otherCitation?: string
  explanation: string
}

const PdfBoxSchema = z.object({
  page: z.number().int().min(1),
  x0: z.number().finite(),
  y0: z.number().finite(),
  x1: z.number().finite(),
  y1: z.number().finite(),
})
const ImageBoxSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
})
const cited = {
  exemptionKey: z.string().max(100).default(''),
  otherCitation: z.string().trim().max(300).optional(),
  explanation: z.string().trim().max(3000).default(''),
}
const BoxSchema = z.union([
  z.object({ pdf: PdfBoxSchema, ...cited }),
  z.object({ image: ImageBoxSchema, ...cited }),
])
const RequestSchema = z.object({
  documentId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  purpose: z.enum(REDACTION_PURPOSES),
  rtkRequestId: z.string().uuid().optional(),
  boxes: z.array(BoxSchema).max(500),
})

export type RedactionRequest = z.input<typeof RequestSchema>

export type RequestRedactionError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'unsupported_type'
  | 'no_boxes'
  | 'unknown_exemption'
  | 'citation_required'
  | 'explanation_required'

const SOURCE_ROLES = ['original', 'pdfa']
const IMAGE_TYPES = ['image/jpeg', 'image/png']

function kindOf(contentType: string): 'pdf' | 'image' | null {
  if (contentType === 'application/pdf') return 'pdf'
  return IMAGE_TYPES.includes(contentType) ? 'image' : null
}

export async function requestRedaction(
  db: Db,
  actor: Actor,
  input: RedactionRequest,
  signal: AbortSignal,
): Promise<Result<{ jobId: string }, RequestRedactionError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'redaction.create', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = RequestSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (value.boxes.length === 0) return err('no_boxes')
  for (const box of value.boxes) {
    const problem = validateWithholdingText(box)
    if (problem !== null) return err(problem)
  }
  return await transactionResult<{ jobId: string }, RequestRedactionError>(db, async (tx) => {
    const [source] = await tx
      .select({ role: documentVersions.role, contentType: documentVersions.contentType })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(
        and(
          eq(documentVersions.id, value.sourceVersionId),
          eq(documentVersions.documentId, value.documentId),
        ),
      )
    if (source === undefined || !SOURCE_ROLES.includes(source.role)) return err('not_found')
    const kind = kindOf(source.contentType)
    if (kind === null) return err('unsupported_type')
    if (!value.boxes.every((b) => (kind === 'pdf' ? 'pdf' in b : 'image' in b))) {
      return err('unsupported_type')
    }
    if (value.rtkRequestId !== undefined) {
      const [request] = await tx
        .select({ id: rtkRequests.id })
        .from(rtkRequests)
        .where(eq(rtkRequests.id, value.rtkRequestId))
      if (request === undefined) return err('not_found')
    }
    const [job] = await tx
      .insert(redactionJobs)
      .values({
        documentId: value.documentId,
        sourceVersionId: value.sourceVersionId,
        purpose: value.purpose,
        rtkRequestId: value.rtkRequestId ?? null,
        createdBy: actor.userId,
      })
      .returning({ id: redactionJobs.id })
    const jobId = job?.id ?? ''
    await tx.insert(redactionBoxes).values(
      value.boxes.map((b) => ({
        jobId,
        page: 'pdf' in b ? b.pdf.page : null,
        pdfBox: 'pdf' in b ? b.pdf : null,
        imageBox: 'image' in b ? b.image : null,
        exemptionKey: b.exemptionKey,
        otherCitation: b.otherCitation ?? null,
        explanation: b.explanation,
      })),
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'redaction.requested',
        entityType: 'document',
        entityId: value.documentId,
        after: { jobId, sourceVersionId: value.sourceVersionId, boxes: value.boxes.length },
      },
      signal,
    )
    return ok({ jobId })
  })
}
