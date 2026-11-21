import { eq } from 'drizzle-orm'
import { hearings } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { type MaineContext, meetingOn, noonOf } from '@/features/demo/me/maineContext'
import { FERNHOLLOW } from '@/features/demo/me/maineTown'
import { must } from '@/features/demo/seedPermitSupport'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { type ProofMethod, referenceRequired } from '@/features/notices/proofMethods'
import { recordProof } from '@/features/notices/proofs'
import { plainFrame } from '@/features/pdf/frame'
import { renderPdf } from '@/features/pdf/renderPdf'
import type { CivilDate } from '@/types/civilDate'

const METHOD = new Map<string, ProofMethod>(
  Object.entries({
    verified_mail: 'certificate_of_mailing',
    certified_mail: 'certified_mail',
    first_class_mail: 'first_class_mail',
    newspaper: 'newspaper_publication',
    public_posting: 'posting',
    bulletin_board: 'posting',
    website: 'website_posting',
  }),
)

export async function demoPdf(
  ctx: MaineContext,
  applicationId: string,
  input: { title: string; docKind: 'notice_proof' | 'attachment' },
): Promise<string> {
  const pdf = await renderPdf({
    title: input.title,
    frame: plainFrame(FERNHOLLOW.name),
    scale: 'document',
    blocks: [{ kind: 'paragraph', text: `${input.title}. Demonstration record.` }],
  })
  return await ctx.db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, ctx.store, pdf, 'application/pdf', ctx.signal)
    const attached = await attachDocument(
      tx,
      ctx.cast.staff,
      {
        target: { kind: 'application', id: applicationId },
        title: input.title,
        docKind: input.docKind,
        file: {
          sha256: stored.sha256,
          filename: `${stored.sha256.slice(0, 8)}.pdf`,
          contentType: 'application/pdf',
        },
        audiences: ['reviewers'],
      },
      ctx.signal,
    )
    return attached.documentId
  })
}

export async function issueAbutterList(
  ctx: MaineContext,
  applicationId: string,
  on: CivilDate,
): Promise<void> {
  const now = noonOf(on)
  const made = must(
    await generateList(ctx.db, ctx.cast.staff, { applicationId }, ctx.signal, now),
    'generate list',
  )
  must(
    await issueList(ctx.db, ctx.cast.staff, { listId: made.listId }, ctx.signal, now),
    'issue list',
  )
}

export async function proveNoticeSet(
  ctx: MaineContext,
  applicationId: string,
  setId: string,
  effectiveOn: CivilDate,
): Promise<void> {
  const status = await noticeStatus(ctx.db, setId, ctx.signal)
  for (const channel of new Set(status.items.map((i) => i.channel))) {
    const method = METHOD.get(channel)
    if (method === undefined) continue
    const documentId = await demoPdf(ctx, applicationId, {
      title: 'Proof of notice',
      docKind: 'notice_proof',
    })
    must(
      await recordProof(
        ctx.db,
        ctx.cast.staff,
        {
          itemIds: status.items.filter((i) => i.channel === channel).map((i) => i.itemId),
          method,
          reference: referenceRequired(method) ? 'FH-2041' : null,
          effectiveOn,
          documentId,
        },
        ctx.signal,
        noonOf(effectiveOn),
      ),
      `proof ${channel}`,
    )
  }
}

export async function scheduleBoardHearing(
  ctx: MaineContext,
  applicationId: string,
  input: { board: 'planning_board' | 'zba'; on: CivilDate },
): Promise<{ hearingId: string; setId: string }> {
  const made = must(
    await scheduleHearing(
      ctx.db,
      ctx.cast.staff,
      {
        applicationId,
        meetingId: await meetingOn(ctx.db, input.board, input.on),
        kind: 'public_hearing',
      },
      ctx.signal,
    ),
    `hearing ${input.on}`,
  )
  const [row] = await ctx.db.select().from(hearings).where(eq(hearings.id, made.hearingId))
  return { hearingId: made.hearingId, setId: row?.noticeSetId ?? '' }
}

export async function holdNoticedHearing(
  ctx: MaineContext,
  hearing: { hearingId: string; applicationId: string; setId: string },
  input: { provedOn: CivilDate; heldOn: CivilDate },
): Promise<void> {
  await proveNoticeSet(ctx, hearing.applicationId, hearing.setId, input.provedOn)
  const now = noonOf(input.heldOn)
  must(
    await markProperlyNoticed(ctx.db, ctx.cast.staff, hearing.hearingId, ctx.signal, now),
    'properly noticed',
  )
  must(
    await markHearingHeld(
      ctx.db,
      ctx.cast.staff,
      { hearingId: hearing.hearingId, heldOn: input.heldOn },
      ctx.signal,
      now,
    ),
    'hearing held',
  )
}
