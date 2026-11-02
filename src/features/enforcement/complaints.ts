import { z } from 'zod'
import type { Db, Tx } from '@/db/client'
import { complaints, enforcementCases } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { attachComplaintPhotos, type CleanPhoto } from '@/features/enforcement/complaintPhotos'
import { nextEnforcementNumber } from '@/features/enforcement/numbering'
import { linkRecordToParcel } from '@/features/parcels/recordLinks'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export const MAX_COMPLAINT_CHARS = 5000

const ComplaintSchema = z.object({
  channel: z.enum(['public_named', 'staff_entry']),
  locationText: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(MAX_COMPLAINT_CHARS),
  parcelId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
})

export type ComplaintInput = z.input<typeof ComplaintSchema>

export interface NewComplaint {
  channel: 'anonymous_web' | 'public_named' | 'staff_entry'
  locationText: string
  description: string
  parcelId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  createdBy?: string | null
  isProbe?: boolean
}

export async function insertComplaintWithCase(
  tx: Tx,
  input: NewComplaint,
  now: Date,
  signal: AbortSignal,
): Promise<{ complaintId: string; number: string; caseId: string; caseNumber: string }> {
  const caseNumbered = await nextEnforcementNumber(tx, 'EC', now, signal)
  const [caseRow] = await tx
    .insert(enforcementCases)
    .values({
      number: caseNumbered.number,
      parcelId: input.parcelId ?? null,
      locationText: input.locationText,
      openedOn: caseNumbered.today,
    })
    .returning({ id: enforcementCases.id })
  const caseId = caseRow?.id ?? ''
  const complaintNumbered = await nextEnforcementNumber(tx, 'CP', now, signal)
  const [row] = await tx
    .insert(complaints)
    .values({
      number: complaintNumbered.number,
      caseId,
      channel: input.channel,
      receivedOn: complaintNumbered.today,
      locationText: input.locationText,
      parcelId: input.parcelId ?? null,
      descriptionOriginal: input.description,
      complainantName: input.name ?? null,
      complainantEmail: input.email ?? null,
      complainantPhone: input.phone ?? null,
      createdBy: input.createdBy ?? null,
      isProbe: input.isProbe ?? false,
    })
    .returning({ id: complaints.id })
  if (input.parcelId !== undefined && input.parcelId !== null) {
    await linkRecordToParcel(
      tx,
      { recordKind: 'enforcement_case', recordId: caseId, parcelId: input.parcelId },
      signal,
    )
  }
  return {
    complaintId: row?.id ?? '',
    number: complaintNumbered.number,
    caseId,
    caseNumber: caseNumbered.number,
  }
}

export async function recordComplaint(
  db: Db,
  actor: Actor | null,
  input: ComplaintInput,
  signal: AbortSignal,
  now: Date = new Date(),
  attachments?: { store: ObjectStore; photos: CleanPhoto[] },
): Promise<
  Result<{ complaintId: string; number: string; caseId: string }, 'forbidden' | 'invalid'>
> {
  signal.throwIfAborted()
  const parsed = ComplaintSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (value.channel === 'staff_entry') {
    if (actor === null) return err('forbidden')
    const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
    if (!allowed.ok) return err('forbidden')
  }
  return await transactionResult(db, async (tx) => {
    const created = await insertComplaintWithCase(
      tx,
      {
        channel: value.channel,
        locationText: value.locationText,
        description: value.description,
        parcelId: value.parcelId ?? null,
        name: value.name ?? null,
        email: value.email ?? null,
        phone: value.phone ?? null,
        createdBy: value.channel === 'staff_entry' ? (actor?.userId ?? null) : null,
      },
      now,
      signal,
    )
    if (attachments !== undefined && attachments.photos.length > 0) {
      await attachComplaintPhotos(
        tx,
        attachments.store,
        {
          caseId: created.caseId,
          photos: attachments.photos,
          actor: { kind: 'system', job: 'enforcement.public_complaint' },
        },
        signal,
      )
    }
    await writeAudit(
      tx,
      {
        actor:
          value.channel === 'staff_entry' && actor !== null
            ? { kind: 'user', userId: actor.userId }
            : { kind: 'system', job: 'enforcement.public_complaint' },
        action: 'enforcement.complaint_received',
        entityType: 'complaint',
        entityId: created.complaintId,
        after: { number: created.number, channel: value.channel, caseId: created.caseId },
      },
      signal,
    )
    return ok({ complaintId: created.complaintId, number: created.number, caseId: created.caseId })
  })
}
