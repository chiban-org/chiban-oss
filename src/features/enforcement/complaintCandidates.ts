import { and, desc, eq, ne } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { complaints, enforcementCases } from '@/db/schema'
import { untouchedShells } from '@/features/enforcement/complaintShells'

export interface AttachableComplaint {
  id: string
  number: string
  receivedOn: string
  locationText: string
  caseNumber: string
  sameParcel: boolean
}

const MAX_CANDIDATES = 50

export async function attachableComplaints(
  db: Db,
  target: { caseId: string; parcelId: string | null },
): Promise<AttachableComplaint[]> {
  const rows = await db
    .select({
      id: complaints.id,
      number: complaints.number,
      receivedOn: complaints.receivedOn,
      locationText: complaints.locationText,
      parcelId: complaints.parcelId,
      caseId: enforcementCases.id,
      caseNumber: enforcementCases.number,
    })
    .from(complaints)
    .innerJoin(enforcementCases, eq(complaints.caseId, enforcementCases.id))
    .where(
      and(
        eq(enforcementCases.status, 'intake'),
        ne(enforcementCases.id, target.caseId),
        eq(complaints.isProbe, false),
      ),
    )
    .orderBy(desc(complaints.receivedOn), desc(complaints.number))
  const shells = await untouchedShells(
    db,
    rows.map((r) => r.caseId),
  )
  const sameParcel = (parcelId: string | null) =>
    target.parcelId !== null && parcelId === target.parcelId
  return rows
    .filter((r) => shells.has(r.caseId))
    .map((r) => ({
      id: r.id,
      number: r.number,
      receivedOn: r.receivedOn,
      locationText: r.locationText,
      caseNumber: r.caseNumber,
      sameParcel: sameParcel(r.parcelId),
    }))
    .sort((a, b) => Number(b.sameParcel) - Number(a.sameParcel))
    .slice(0, MAX_CANDIDATES)
}
