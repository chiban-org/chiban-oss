import { PDFDocument, StandardFonts } from 'pdf-lib'
import { env } from '@/config/env'
import { parcels } from '@/db/schema'
import { must } from '@/features/demo/seedPermitSupport'
import type { RtkSeedContext } from '@/features/demo/seedRtk'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { requestRedaction } from '@/features/redaction/redactionJobs'
import { runRedactionJob } from '@/features/redaction/runRedactionJob'

const CONVERSION_TIMEOUT_MS = 120_000
const SERIES = 'nh.rs.correspondence_administrative'

export const DEMO_PHONE_BOX = { page: 1, x0: 60, y0: 70, x1: 320, y1: 100 }

export async function demoLetterBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([612, 792])
  page.drawText('Owner phone 603-555-0147', { x: 72, y: 700, size: 14, font })
  page.drawText('Permit BP-2027-0001', { x: 72, y: 640, size: 14, font })
  page.drawText('Inspection scheduled for the week of March 8', { x: 72, y: 580, size: 12, font })
  return await doc.save()
}

export async function seedLetterDocument(
  ctx: RtkSeedContext,
  title: string,
): Promise<{ documentId: string; versionId: string }> {
  const [parcel] = await ctx.db.select({ id: parcels.id }).from(parcels).limit(1)
  if (parcel === undefined) throw new Error('Demo seed needs a parcel')
  return await ctx.db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(
      tx,
      ctx.store,
      await demoLetterBytes(),
      'application/pdf',
      ctx.signal,
    )
    return await attachDocument(
      tx,
      ctx.custodian,
      {
        target: { kind: 'parcel', id: parcel.id },
        title,
        docKind: 'attachment',
        file: {
          sha256: stored.sha256,
          filename: 'owner-letter.pdf',
          contentType: 'application/pdf',
        },
        seriesKey: SERIES,
        isPublic: false,
        audiences: [],
      },
      ctx.signal,
    )
  })
}

export async function seedRedactedVersion(
  ctx: RtkSeedContext,
  source: { documentId: string; versionId: string },
  purpose: 'public' | 'rtk_release',
  rtkRequestId?: string,
): Promise<string> {
  const requested = must(
    await requestRedaction(
      ctx.db,
      ctx.custodian,
      {
        documentId: source.documentId,
        sourceVersionId: source.versionId,
        purpose,
        ...(rtkRequestId === undefined ? {} : { rtkRequestId }),
        boxes: [
          {
            pdf: DEMO_PHONE_BOX,
            exemptionKey: 'nh.rtk.91a5.iv',
            explanation: 'The private telephone number of a resident invades the resident privacy.',
          },
        ],
      },
      ctx.signal,
    ),
    'request a demo redaction',
  )
  const converter = createGhostscriptConverter({
    gsPath: env.GHOSTSCRIPT_PATH,
    iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
    timeoutMs: CONVERSION_TIMEOUT_MS,
  })
  const ran = must(
    await runRedactionJob(ctx.db, ctx.store, converter, { jobId: requested.jobId }, ctx.signal),
    'run a demo redaction',
  )
  if (ran !== 'complete') throw new Error('Demo redaction did not complete')
  return requested.jobId
}
