import { and, asc, eq, or } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  documents,
  documentVersions,
  files,
  renditionApprovals,
  rtkReleaseItems,
  rtkReleases,
  rtkRequests,
} from '@/db/schema'
import { releaseFilename } from '@/features/rtk/releaseFilename'
import { hashReleaseToken } from '@/features/rtk/releases'
import type { StoredObject } from '@/features/storage/delivery'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface ReleaseView {
  requestNumber: string
  sequence: number
  releasedOn: CivilDate
  expiresAt: string
  items: {
    versionId: string
    title: string
    filename: string
    downloadName: string
    withdrawnOn: CivilDate | null
  }[]
}

type Release = typeof rtkReleases.$inferSelect

async function townDate(db: Db, at: Date, signal: AbortSignal): Promise<CivilDate> {
  const town = await getTownSettings(db, signal)
  return todayInTimeZone(town.ok ? town.value.timeZone : 'UTC', at)
}

async function resolveReleaseLink(
  db: Db,
  token: string,
  now: Date,
): Promise<Result<Release, 'invalid' | 'expired'>> {
  const [release] = await db
    .select()
    .from(rtkReleases)
    .where(eq(rtkReleases.linkTokenHash, hashReleaseToken(token)))
  if (release === undefined || release.linkRevokedAt !== null || release.linkExpiresAt === null) {
    return err('invalid')
  }
  if (release.linkExpiresAt.getTime() <= now.getTime()) return err('expired')
  return ok(release)
}

export async function openRelease(
  db: Db,
  token: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<ReleaseView, 'invalid' | 'expired'>> {
  signal.throwIfAborted()
  const resolved = await resolveReleaseLink(db, token, now)
  if (!resolved.ok) return err(resolved.error)
  const release = resolved.value
  const [request] = await db
    .select({ number: rtkRequests.number })
    .from(rtkRequests)
    .where(eq(rtkRequests.id, release.requestId))
  const rows = await db
    .select({
      versionId: rtkReleaseItems.versionId,
      formerVersionId: rtkReleaseItems.formerVersionId,
      title: documents.title,
      filename: documentVersions.filename,
      withdrawnAt: rtkReleaseItems.withdrawnAt,
    })
    .from(rtkReleaseItems)
    .innerJoin(documents, eq(documents.id, rtkReleaseItems.documentId))
    .leftJoin(documentVersions, eq(documentVersions.id, rtkReleaseItems.versionId))
    .where(eq(rtkReleaseItems.releaseId, release.id))
    .orderBy(asc(rtkReleaseItems.position))
  const items = await Promise.all(
    rows.map(async (row) => {
      const withdrawnAt = row.withdrawnAt
      return {
        versionId: row.versionId ?? row.formerVersionId ?? '',
        title: row.title,
        filename: row.filename ?? '',
        downloadName: releaseFilename(row.title, row.filename ?? ''),
        withdrawnOn: withdrawnAt === null ? null : await townDate(db, withdrawnAt, signal),
      }
    }),
  )
  return ok({
    requestNumber: request?.number ?? '',
    sequence: release.sequence,
    releasedOn: release.releasedOn as CivilDate,
    expiresAt: release.linkExpiresAt?.toISOString() ?? '',
    items,
  })
}

export async function openReleaseVersion(
  db: Db,
  token: string,
  versionId: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<StoredObject, 'invalid' | 'expired' | 'not_found' | { withdrawnOn: CivilDate }>> {
  signal.throwIfAborted()
  const resolved = await resolveReleaseLink(db, token, now)
  if (!resolved.ok) return err(resolved.error)
  const [row] = await db
    .select({
      storageKey: files.storageKey,
      title: documents.title,
      filename: documentVersions.filename,
      contentType: documentVersions.contentType,
      withdrawnAt: rtkReleaseItems.withdrawnAt,
      approvalRevokedAt: renditionApprovals.revokedAt,
      approvalRevokeReason: renditionApprovals.revokeReason,
    })
    .from(rtkReleaseItems)
    .innerJoin(documents, eq(documents.id, rtkReleaseItems.documentId))
    .leftJoin(documentVersions, eq(documentVersions.id, rtkReleaseItems.versionId))
    .leftJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .leftJoin(renditionApprovals, eq(renditionApprovals.id, rtkReleaseItems.approvalId))
    .where(
      and(
        eq(rtkReleaseItems.releaseId, resolved.value.id),
        or(
          eq(rtkReleaseItems.versionId, versionId),
          eq(rtkReleaseItems.formerVersionId, versionId),
        ),
      ),
    )
  if (row === undefined) return err('not_found')
  if (row.withdrawnAt !== null) {
    return err({ withdrawnOn: await townDate(db, row.withdrawnAt, signal) })
  }
  if (row.approvalRevokedAt !== null && row.approvalRevokeReason !== 'superseded') {
    return err({ withdrawnOn: await townDate(db, row.approvalRevokedAt, signal) })
  }
  if (row.storageKey === null || row.filename === null || row.contentType === null) {
    return err('not_found')
  }
  return ok({
    storageKey: row.storageKey,
    filename: releaseFilename(row.title, row.filename),
    contentType: row.contentType,
  })
}
