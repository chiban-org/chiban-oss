import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents, documentVersions, files, rtkReleaseItems, type rtkReleases } from '@/db/schema'
import type { MailAttachment, MailTransport } from '@/features/mail/transport'
import { releaseFilename } from '@/features/rtk/releaseFilename'
import {
  MAX_ATTACHED_BYTES,
  mintReleaseLink,
  type ReleaseLink,
  sendReleaseFiles,
  sendReleaseLink,
} from '@/features/rtk/releaseMail'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export type ReleaseDelivery = 'attached' | 'link' | 'link_fallback' | 'none'

export interface DeliveryContext {
  store: ObjectStore
  mail: MailTransport
  signal: AbortSignal
  now: Date
}

type ReleaseMethod = (typeof rtkReleases.$inferSelect)['method']

export interface DeliveryInput {
  releaseId: string
  number: string
  releasedOn: string
  letterDocumentId: string
}

interface StoredFile {
  filename: string
  contentType: string
  storageKey: string
  sizeBytes: number
}

async function releasedFiles(db: DbOrTx, releaseId: string): Promise<StoredFile[]> {
  const rows = await db
    .select({
      title: documents.title,
      filename: documentVersions.filename,
      contentType: documentVersions.contentType,
      storageKey: files.storageKey,
      sizeBytes: files.sizeBytes,
    })
    .from(rtkReleaseItems)
    .innerJoin(documents, eq(documents.id, rtkReleaseItems.documentId))
    .innerJoin(documentVersions, eq(documentVersions.id, rtkReleaseItems.versionId))
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(rtkReleaseItems.releaseId, releaseId))
    .orderBy(asc(rtkReleaseItems.position))
  return rows.map(({ title, ...row }) => ({
    ...row,
    filename: releaseFilename(title, row.filename),
  }))
}

export async function originalFileOf(
  db: DbOrTx,
  documentId: string,
): Promise<StoredFile | undefined> {
  const [row] = await db
    .select({
      filename: documentVersions.filename,
      contentType: documentVersions.contentType,
      storageKey: files.storageKey,
      sizeBytes: files.sizeBytes,
    })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.role, 'original')))
  return row
}

export async function attachmentsOf(
  store: ObjectStore,
  stored: StoredFile[],
  signal: AbortSignal,
): Promise<MailAttachment[] | null> {
  const out: MailAttachment[] = []
  for (const file of stored) {
    const stream = await store.getStream(file.storageKey, signal)
    if (!stream.ok) return null
    out.push({
      filename: file.filename,
      contentType: file.contentType,
      content: Buffer.from(await new Response(stream.value).arrayBuffer()),
    })
  }
  return out
}

export interface DeliveryPlan {
  delivery: ReleaseDelivery
  recipientEmail: string | null
  link: ReleaseLink | null
}

const NO_DELIVERY: DeliveryPlan = { delivery: 'none', recipientEmail: null, link: null }

async function versionBytes(db: DbOrTx, versionIds: string[]): Promise<number> {
  if (versionIds.length === 0) return 0
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::bigint` })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(inArray(documentVersions.id, versionIds))
  return Number(row?.total ?? 0)
}

export async function planDelivery(
  db: DbOrTx,
  input: { method: ReleaseMethod; recipientEmail: string | undefined; versionIds: string[] },
  now: Date,
): Promise<DeliveryPlan> {
  const recipientEmail = input.recipientEmail ?? null
  if (recipientEmail === null || input.method === 'inspection' || input.method === 'paper')
    return NO_DELIVERY
  if (input.method === 'email' && (await versionBytes(db, input.versionIds)) <= MAX_ATTACHED_BYTES)
    return { delivery: 'attached', recipientEmail, link: null }
  const delivery = input.method === 'email' ? 'link_fallback' : 'link'
  return { delivery, recipientEmail, link: mintReleaseLink(now) }
}

export async function sendRelease(
  db: DbOrTx,
  ctx: DeliveryContext,
  plan: DeliveryPlan,
  input: DeliveryInput,
): Promise<Result<void, 'send_failed'>> {
  if (plan.recipientEmail === null) return ok(undefined)
  const letter = await originalFileOf(db, input.letterDocumentId)
  const stored = [
    ...(plan.delivery === 'attached' ? await releasedFiles(db, input.releaseId) : []),
    ...(letter === undefined ? [] : [letter]),
  ]
  const attachments = await attachmentsOf(ctx.store, stored, ctx.signal)
  if (attachments === null) return err('send_failed')
  const message = {
    to: plan.recipientEmail,
    number: input.number,
    releasedOn: input.releasedOn,
    attachments,
  }
  const sent =
    plan.link === null
      ? await sendReleaseFiles(ctx.mail, message, ctx.signal)
      : await sendReleaseLink(
          ctx.mail,
          { ...message, token: plan.link.token, tooLarge: plan.delivery === 'link_fallback' },
          ctx.signal,
        )
  return sent ? ok(undefined) : err('send_failed')
}
