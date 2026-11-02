import { NH_RTK_EXEMPTIONS, OTHER_LAW_EXEMPTION_KEY } from '@packs/nh/rtkExemptions'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { RTK_WITHHOLDING_SCOPES, rtkRequests, rtkWithholdings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

const MIN_EXPLANATION = 20

const WithholdingSchema = z.object({
  requestId: z.string().uuid(),
  scope: z.enum(RTK_WITHHOLDING_SCOPES),
  documentId: z.string().uuid().optional(),
  recordDescription: z.string().trim().min(1).max(1000),
  exemptionKey: z.string().min(1).max(100),
  otherCitation: z.string().trim().max(300).optional(),
  explanation: z.string().trim().max(3000),
})

export type WithholdingInput = z.input<typeof WithholdingSchema>

export function exemptionKnown(key: string): boolean {
  return key === OTHER_LAW_EXEMPTION_KEY || NH_RTK_EXEMPTIONS.some((e) => e.key === key)
}

export function validateWithholdingText(input: {
  exemptionKey: string
  otherCitation?: string | null | undefined
  explanation: string
}): 'unknown_exemption' | 'citation_required' | 'explanation_required' | null {
  if (!exemptionKnown(input.exemptionKey)) return 'unknown_exemption'
  if (
    input.exemptionKey === OTHER_LAW_EXEMPTION_KEY &&
    (input.otherCitation ?? '').trim().length === 0
  ) {
    return 'citation_required'
  }
  if (input.explanation.trim().length < MIN_EXPLANATION) return 'explanation_required'
  return null
}

export async function recordWithholding(
  db: Db,
  actor: Actor,
  input: WithholdingInput,
  signal: AbortSignal,
): Promise<
  Result<
    { withholdingId: string },
    | 'forbidden'
    | 'invalid'
    | 'not_found'
    | 'unknown_exemption'
    | 'citation_required'
    | 'explanation_required'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = WithholdingSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  const problem = validateWithholdingText(value)
  if (problem !== null) return err(problem)
  return await transactionResult(db, async (tx) => {
    const [request] = await tx
      .select({ id: rtkRequests.id })
      .from(rtkRequests)
      .where(eq(rtkRequests.id, value.requestId))
    if (request === undefined) return err('not_found')
    const [row] = await tx
      .insert(rtkWithholdings)
      .values({
        requestId: value.requestId,
        scope: value.scope,
        documentId: value.documentId ?? null,
        recordDescription: value.recordDescription,
        exemptionKey: value.exemptionKey,
        otherCitation:
          value.exemptionKey === OTHER_LAW_EXEMPTION_KEY ? (value.otherCitation ?? null) : null,
        explanation: value.explanation,
        createdBy: actor.userId,
      })
      .returning({ id: rtkWithholdings.id })
    const withholdingId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rtk.withholding_recorded',
        entityType: 'rtk_request',
        entityId: value.requestId,
        after: { withholdingId, exemptionKey: value.exemptionKey, scope: value.scope },
      },
      signal,
    )
    return ok({ withholdingId })
  })
}
