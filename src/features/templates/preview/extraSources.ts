import { desc, eq } from 'drizzle-orm'
import {
  applications,
  certificatesOfOccupancy,
  counselReferrals,
  enforcementCases,
  inspections,
  trcRoutings,
  users,
} from '@/db/schema'
import { certificateDocumentInput } from '@/features/certificates/certificatePdf'
import { counselPacketInput } from '@/features/enforcement/counselPacket'
import { trcSummaryInput } from '@/features/reviews/trcSummary'
import { type PreviewSource, SAMPLE_LIMIT } from '@/features/templates/preview/previewTypes'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export const CERTIFICATE_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({
        id: certificatesOfOccupancy.id,
        number: certificatesOfOccupancy.number,
        issuedOn: certificatesOfOccupancy.issuedOn,
      })
      .from(certificatesOfOccupancy)
      .orderBy(desc(certificatesOfOccupancy.issuedAt))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      label: `${r.number}, issued ${formatCivilDate(r.issuedOn)}`,
    }))
  },
  async input({ db, signal }, id) {
    const [cert] = await db
      .select()
      .from(certificatesOfOccupancy)
      .where(eq(certificatesOfOccupancy.id, id))
    if (cert === undefined) return null
    const [final] = await db
      .select()
      .from(inspections)
      .where(eq(inspections.id, cert.finalInspectionId))
    const [inspector] = await db
      .select({ name: users.displayName })
      .from(users)
      .where(eq(users.id, final?.resultRecordedBy ?? ''))
    const built = await certificateDocumentInput(
      db,
      cert.applicationId,
      {
        number: cert.number,
        issuedOn: cert.issuedOn as CivilDate,
        finalInspectionOn: (final?.scheduledDate ?? cert.issuedOn) as CivilDate,
        inspectorName: inspector?.name ?? 'Inspector',
      },
      signal,
    )
    return built?.input ?? null
  },
}

export const TRC_SUMMARY_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .selectDistinct({ id: applications.id, number: applications.number, seq: applications.seq })
      .from(trcRoutings)
      .innerJoin(applications, eq(applications.id, trcRoutings.applicationId))
      .orderBy(desc(applications.seq))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({ id: r.id, label: `${r.number}, technical review` }))
  },
  async input({ db, actor, signal }, id) {
    const built = await trcSummaryInput(db, actor, id, signal)
    return built.ok ? built.value.input : null
  },
}

export const COUNSEL_PACKET_COVER_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({
        id: counselReferrals.id,
        number: enforcementCases.number,
        property: enforcementCases.locationText,
        referredOn: counselReferrals.referredOn,
      })
      .from(counselReferrals)
      .innerJoin(enforcementCases, eq(enforcementCases.id, counselReferrals.caseId))
      .orderBy(desc(counselReferrals.referredOn))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      label: `${r.number}, ${r.property}, referred ${formatCivilDate(r.referredOn)}`,
    }))
  },
  async input({ db, signal }, id) {
    const [referral] = await db.select().from(counselReferrals).where(eq(counselReferrals.id, id))
    if (referral === undefined) return null
    return await counselPacketInput(
      db,
      referral.caseId,
      referral.referredOn as CivilDate,
      new Date(),
      signal,
    )
  },
}
