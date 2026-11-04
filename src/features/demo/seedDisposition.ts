import { must } from '@/features/demo/seedPermitSupport'
import type { RtkSeedContext } from '@/features/demo/seedRtk'
import { approveDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import { attachDocument } from '@/features/documents/attach'
import { openCase } from '@/features/enforcement/cases'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { finishDisposition } from '@/features/files/releaseFile'
import { renderPdf } from '@/features/pdf/renderPdf'
import { recordRetentionEvent } from '@/features/records/recordEvents'
import { addDays } from '@/types/civilDate'

export async function caseWithPhoto(ctx: RtkSeedContext, location: string, title: string) {
  const opened = must(
    await openCase(ctx.db, ctx.staff, { locationText: location }, ctx.signal, ctx.now),
    'open a demo case',
  )
  const bytes = await renderPdf({
    title,
    townName: 'Town of Alder Pond',
    scale: 'document',
    blocks: [{ kind: 'paragraph', text: `${title}. Photograph log for ${location}.` }],
  })
  const documentId = await ctx.db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, ctx.store, bytes, 'application/pdf', ctx.signal)
    const attached = await attachDocument(
      tx,
      ctx.staff,
      {
        target: { kind: 'enforcement_case', id: opened.caseId },
        title,
        docKind: 'enforcement_photo',
        file: { sha256: stored.sha256, filename: `${title}.pdf`, contentType: 'application/pdf' },
      },
      ctx.signal,
    )
    return attached.documentId
  })
  return { caseId: opened.caseId, documentId }
}

export async function seedDispositionDemo(ctx: RtkSeedContext): Promise<void> {
  const executed = await caseWithPhoto(ctx, 'Old Mill Road', 'Closed complaint photo log')
  must(
    await recordRetentionEvent(
      ctx.db,
      ctx.staff,
      {
        target: { caseId: executed.caseId },
        kind: 'appeal_period_expired',
        occurredOn: addDays(ctx.today, -400),
      },
      ctx.signal,
      ctx.now,
    ),
    'record the appeal period for the executed case',
  )
  const proposed = must(
    await proposeDisposition(ctx.db, ctx.staff, { asOf: ctx.today }, ctx.signal, ctx.now),
    'propose a demo disposition',
  )
  must(
    await approveDisposition(ctx.db, ctx.custodian, { batchId: proposed.batchId }, ctx.signal),
    'approve the demo disposition',
  )
  must(await executeDisposition(ctx.db, { batchId: proposed.batchId }, ctx.signal), 'execute it')
  await finishDisposition(ctx.db, ctx.store, proposed.batchId, ctx.signal)
  await caseWithPhoto(ctx, 'Pine Hill Road', 'Open complaint photo log')
  const eligible = await caseWithPhoto(ctx, 'Cedar Court', 'Resolved complaint photo log')
  must(
    await recordRetentionEvent(
      ctx.db,
      ctx.staff,
      {
        target: { caseId: eligible.caseId },
        kind: 'appeal_period_expired',
        occurredOn: addDays(ctx.today, -30),
      },
      ctx.signal,
      ctx.now,
    ),
    'record the appeal period for the eligible case',
  )
}
