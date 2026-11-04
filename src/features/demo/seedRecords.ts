import { eq } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { applications, documents, documentVersions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { claimProject, sendContractorClaim } from '@/features/contractors/claims'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import {
  actorFor,
  type Cast,
  d,
  must,
  noon,
  open,
  TRADE_VALUES,
} from '@/features/demo/seedPermitSupport'
import { attachDocument } from '@/features/documents/attach'
import { setPublic } from '@/features/documents/publish'
import type { RecordRef } from '@/features/documents/types'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { getMailTransport, type MailTransport } from '@/features/mail/transport'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { renderPdf } from '@/features/pdf/renderPdf'
import { createGhostscriptConverter, type PdfaConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { placeHold } from '@/features/records/holds'
import { approveRendition } from '@/features/renditions/approvals'
import { addReviewComment, assignReviewer } from '@/features/reviews/assignments'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'

export const RECORDS_MARKER_TITLE = 'Recorded plat'
const PLAT_SERIES = 'nh.rs.blueprints_architectural'
const CORRUPT_PDF = new TextEncoder().encode('%PDF-1.4\nthis is not a readable document\n')
const CONVERSION_TIMEOUT_MS = 120_000
const PRESERVATION_BATCH = 200

export interface SeedRecordsDeps {
  store?: ObjectStore
  converter?: PdfaConverter
  mail?: MailTransport
}

interface Context {
  db: Db
  signal: AbortSignal
  store: ObjectStore
  staff: Actor
}

async function textPdf(title: string, line: string): Promise<Uint8Array> {
  return await renderPdf({
    title,
    townName: 'Town of Alder Pond',
    scale: 'document',
    blocks: [{ kind: 'paragraph', text: line }],
  })
}

async function attach(
  ctx: Context,
  actor: Actor,
  input: { target: RecordRef; title: string; bytes: Uint8Array; seriesKey?: string },
): Promise<{ documentId: string; versionId: string }> {
  const stored = await storeGeneratedBytes(
    ctx.db,
    ctx.store,
    input.bytes,
    'application/pdf',
    ctx.signal,
  )
  return await ctx.db.transaction((tx) =>
    attachDocument(
      tx,
      actor,
      {
        target: input.target,
        title: input.title,
        docKind: input.target.kind === 'parcel' ? 'parcel_file' : 'attachment',
        file: {
          sha256: stored.sha256,
          filename: `${input.title}.pdf`,
          contentType: 'application/pdf',
        },
        ...(input.seriesKey === undefined ? {} : { seriesKey: input.seriesKey }),
        ...(input.target.kind === 'parcel' ? { isPublic: true } : {}),
      },
      ctx.signal,
    ),
  )
}

async function seedParcelFiles(ctx: Context, parcelId: string): Promise<{ documentId: string }[]> {
  const target: RecordRef = { kind: 'parcel', id: parcelId }
  const plat = await attach(ctx, ctx.staff, {
    target,
    title: RECORDS_MARKER_TITLE,
    bytes: await textPdf('Recorded plat', 'Plat of the lot as recorded with the county.'),
    seriesKey: PLAT_SERIES,
  })
  const septic = await attach(ctx, ctx.staff, {
    target,
    title: 'Septic approval',
    bytes: await textPdf('Septic approval', 'State septic system approval for the lot.'),
    seriesKey: PLAT_SERIES,
  })
  return [plat, septic]
}

async function seedRedactedCopy(ctx: Context, documentId: string): Promise<void> {
  const stored = await storeGeneratedBytes(
    ctx.db,
    ctx.store,
    await textPdf('Panel schedule', 'Panel schedule. Contact details removed for the public copy.'),
    'application/pdf',
    ctx.signal,
  )
  const [version] = await ctx.db
    .insert(documentVersions)
    .values({
      documentId,
      role: 'public_redacted',
      fileSha256: stored.sha256,
      filename: 'Panel schedule (public).pdf',
      contentType: 'application/pdf',
      createdBy: ctx.staff.userId,
    })
    .returning({ id: documentVersions.id })
  must(
    await approveRendition(
      ctx.db,
      ctx.staff,
      {
        versionId: version?.id ?? '',
        purpose: 'public',
        reviewStatement: 'Contact details removed from the public copy and checked by staff.',
      },
      ctx.signal,
    ),
    'approve the public copy',
  )
  must(await setPublic(ctx.db, ctx.staff, { documentId, isPublic: true }, ctx.signal), 'publish')
}

async function claimBoth(ctx: Context, contractor: Actor, projectIds: string[]): Promise<void> {
  const mail = createMemoryTransport()
  for (const projectId of projectIds) {
    must(
      await sendContractorClaim(
        ctx.db,
        mail,
        ctx.staff,
        { projectId, email: `contractor@${DEMO_DOMAIN}`, name: 'Cory Contractor' },
        ctx.signal,
      ),
      'claim link',
    )
    const token = /\/claim\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    must(await claimProject(ctx.db, contractor, token, ctx.signal), 'claim')
  }
}

export async function seedRecords(
  db: Db,
  signal: AbortSignal,
  deps: SeedRecordsDeps = {},
): Promise<boolean> {
  signal.throwIfAborted()
  const marker = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.title, RECORDS_MARKER_TITLE))
    .limit(1)
  if (marker.length > 0) return false
  const cast: Cast = {
    admin: await actorFor(db, 'admin', signal),
    staff: await actorFor(db, 'staff', signal),
    applicant: await actorFor(db, 'applicant', signal),
  }
  const ctx: Context = { db, signal, store: deps.store ?? getObjectStore(), staff: cast.staff }
  const parcel = must(await resolveParcelId(db, { value: '007001000000' }, signal), 'parcel')
  await seedParcelFiles(ctx, parcel.parcelId)

  const first = await open(db, cast, signal, {
    parcel: '007001000000',
    title: 'Panel upgrade with documents',
    typeKey: 'EL',
    values: TRADE_VALUES,
    submittedOn: '2026-10-22',
  })
  const second = await open(db, cast, signal, {
    parcel: '007002000000',
    title: 'Subpanel for the barn',
    typeKey: 'EL',
    values: TRADE_VALUES,
    submittedOn: '2026-10-23',
  })
  const target: RecordRef = { kind: 'application', id: first.applicationId }
  const schedule = await attach(ctx, cast.applicant, {
    target,
    title: 'Panel schedule',
    bytes: await textPdf('Panel schedule', 'Panel schedule. Call the owner at 603-555-0142.'),
  })
  await attach(ctx, cast.applicant, {
    target,
    title: 'Site sketch',
    bytes: await textPdf('Site sketch', 'Sketch of the service entrance location.'),
  })
  await seedRedactedCopy(ctx, schedule.documentId)
  await attach(ctx, cast.applicant, {
    target,
    title: 'Scanned letter (unreadable)',
    bytes: CORRUPT_PDF,
  })

  const reviewer = await actorFor(db, 'reviewer', signal)
  const assigned = must(
    await assignReviewer(
      db,
      cast.staff,
      { applicationId: first.applicationId, reviewerUserId: reviewer.userId },
      signal,
    ),
    'reviewer',
  )
  must(
    await addReviewComment(
      db,
      reviewer,
      { assignmentId: assigned.assignmentId, body: 'The panel schedule matches the service size.' },
      signal,
    ),
    'review comment',
  )

  const [secondApp] = await db
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, second.applicationId))
  const [firstApp] = await db
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, first.applicationId))
  const custodian = await actorFor(db, 'records', signal)
  must(
    await placeHold(
      db,
      custodian,
      {
        target: { kind: 'project', id: secondApp?.projectId ?? '' },
        reason: 'Hold while a neighbor dispute over the barn is resolved',
      },
      signal,
    ),
    'hold',
  )

  const contractor = await actorFor(db, 'contractor', signal)
  await claimBoth(ctx, contractor, [firstApp?.projectId ?? '', secondApp?.projectId ?? ''])
  await processPreservation(
    db,
    ctx.store,
    deps.converter ??
      createGhostscriptConverter({
        gsPath: env.GHOSTSCRIPT_PATH,
        iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
        timeoutMs: CONVERSION_TIMEOUT_MS,
      }),
    signal,
    PRESERVATION_BATCH,
  )
  return true
}
