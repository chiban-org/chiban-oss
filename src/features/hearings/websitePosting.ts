import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { hearings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { renderPublicNoticePdf } from '@/features/hearings/publicNotices'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'

export type WebsitePostingError = 'forbidden' | 'not_found' | 'not_listed' | 'proof_failed'

export interface WebsitePostingInput {
  hearingId: string
  store: ObjectStore
  now?: Date
}

export async function postNoticeOnWebsite(
  db: Db,
  actor: Actor,
  input: WebsitePostingInput,
  signal: AbortSignal,
): Promise<Result<{ itemsProved: number }, WebsitePostingError>> {
  signal.throwIfAborted()
  const { hearingId, store, now = new Date() } = input
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const [hearing] = await db.select().from(hearings).where(eq(hearings.id, hearingId))
  if (hearing === undefined) return err('not_found')
  const today = await townToday(db, now, signal)
  const status = await noticeStatus(db, hearing.noticeSetId, signal)
  const waiting = status.items.filter((i) => i.channel === 'website' && i.state === 'missing')
  if (waiting.length === 0) return ok({ itemsProved: 0 })
  const pdf = await renderPublicNoticePdf(db, hearingId, today, signal)
  if (pdf === null) return err('not_listed')
  const documentId = await db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, store, pdf, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'application', id: hearing.applicationId },
        title: `Hearing notice posted on the Town website, ${formatCivilDate(today)}`,
        docKind: 'notice_proof',
        file: {
          sha256: stored.sha256,
          filename: `hearing-notice-${today}.pdf`,
          contentType: 'application/pdf',
        },
        audiences: ['reviewers'],
      },
      signal,
    )
    return attached.documentId
  })
  const proved = await recordProof(
    db,
    actor,
    {
      itemIds: waiting.map((i) => i.itemId),
      method: 'website_posting',
      reference: null,
      effectiveOn: today,
      documentId,
    },
    signal,
    now,
  )
  return proved.ok ? ok({ itemsProved: waiting.length }) : err('proof_failed')
}
