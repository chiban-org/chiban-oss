import {
  type EnforcementSeedContext,
  must,
  photoBytes,
} from '@/features/demo/seedEnforcementSupport'
import { setCaseStatus } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { recordFinding } from '@/features/enforcement/findings'
import { addNote } from '@/features/enforcement/notes'
import { recordNoticeReceipt, sendViolationNotice } from '@/features/enforcement/notices'

export async function seedNamedComplaintCase(ctx: EnforcementSeedContext): Promise<void> {
  const { db, signal, staff } = ctx
  const photos = await Promise.all(
    [0, 25].map(async (shade) => ({ bytes: await photoBytes(shade), type: 'image/jpeg' as const })),
  )
  const complaint = must(
    await recordComplaint(
      db,
      null,
      {
        channel: 'public_named',
        locationText: '22 Heron Cove Road',
        description: 'A shed went up this summer very close to the lot line next to my yard.',
        name: 'Jordan Neighbor',
        email: 'jordan.neighbor@alderpond.example',
        phone: '603-555-0117',
      },
      signal,
      ctx.now,
      { store: ctx.store, photos },
    ),
    'named complaint',
  )
  const caseId = complaint.caseId
  must(
    await setCaseStatus(
      db,
      staff,
      { caseId, to: 'investigating', expectedRowVersion: 1 },
      signal,
      ctx.now,
    ),
    'investigate the named complaint case',
  )
  must(
    await addNote(
      db,
      staff,
      {
        caseId,
        observedOn: ctx.day(-13),
        body: 'Drove by. A wooden shed about 10 by 12 feet stands close to the side lot line.',
      },
      signal,
    ),
    'note',
  )
  must(
    await recordFinding(
      db,
      staff,
      {
        caseId,
        provisionKind: 'zoning_ordinance',
        provisionRef: 'Zoning Ordinance Section 4.2, accessory structure setbacks',
        facts:
          'A shed stands about 3 feet from the side lot line. The required setback is 10 feet.',
        inspectionDate: ctx.day(-12),
      },
      signal,
      ctx.now,
    ),
    'finding',
  )
  const findingRows = await db.query.violationFindings.findMany({
    where: (f, { eq }) => eq(f.caseId, caseId),
  })
  const notice = must(
    await sendViolationNotice(
      db,
      ctx.store,
      staff,
      {
        caseId,
        findingIds: findingRows.map((f) => f.id),
        sentOn: ctx.day(-10),
        method: 'certified_mail',
      },
      signal,
    ),
    'notice',
  )
  must(
    await recordNoticeReceipt(
      db,
      staff,
      {
        noticeId: notice.noticeId,
        receivedOn: ctx.day(-7),
        basis: 'Signed certified mail receipt',
      },
      signal,
    ),
    'receipt',
  )
}
