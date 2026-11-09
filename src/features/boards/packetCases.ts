import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  agendaItems,
  applications,
  documents,
  hearings,
  parcels,
  projectParties,
  projects,
} from '@/db/schema'
import { formApplicantName, namedParty } from '@/features/applications/applicantName'
import { agendaDocumentIds } from '@/features/boards/packetCandidates'

export interface PacketAgendaItem {
  id: string
  number: number
  title: string
}

export interface ItemCase {
  isAgenda: boolean
  agendaItemId: string | null
  applicationNumber: string | null
  siteAddress: string | null
  applicantName: string | null
}

export interface PacketCases {
  agenda: PacketAgendaItem[]
  caseOf: (documentId: string) => ItemCase
}

export const NO_CASE: ItemCase = {
  isAgenda: false,
  agendaItemId: null,
  applicationNumber: null,
  siteAddress: null,
  applicantName: null,
}

async function agendaOf(db: DbOrTx, meetingId: string | null) {
  if (meetingId === null) return []
  return await db
    .select({
      id: agendaItems.id,
      position: agendaItems.position,
      title: agendaItems.title,
      applicationId: hearings.applicationId,
    })
    .from(agendaItems)
    .leftJoin(hearings, eq(hearings.id, agendaItems.hearingId))
    .where(eq(agendaItems.meetingId, meetingId))
    .orderBy(asc(agendaItems.position), asc(agendaItems.id))
}

async function applicationFacts(db: DbOrTx, applicationIds: string[]) {
  if (applicationIds.length === 0)
    return new Map<string, Omit<ItemCase, 'isAgenda' | 'agendaItemId'>>()
  const rows = await db
    .select({
      id: applications.id,
      number: applications.number,
      values: applications.values,
      siteAddress: parcels.siteAddress,
      applicant: projectParties.name,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .leftJoin(parcels, eq(parcels.id, projects.parcelId))
    .leftJoin(
      projectParties,
      and(
        eq(projectParties.projectId, projects.id),
        eq(projectParties.role, 'applicant'),
        isNull(projectParties.removedAt),
      ),
    )
    .where(inArray(applications.id, applicationIds))
    .orderBy(asc(projectParties.addedAt))
  const out = new Map<string, Omit<ItemCase, 'isAgenda' | 'agendaItemId'>>()
  for (const row of rows) {
    if (out.has(row.id)) continue
    out.set(row.id, {
      applicationNumber: row.number,
      siteAddress: row.siteAddress,
      applicantName:
        formApplicantName(row.values as Record<string, unknown>) ?? namedParty(row.applicant ?? ''),
    })
  }
  return out
}

export async function packetCases(
  db: DbOrTx,
  input: { meetingId: string | null; documentIds: string[] },
): Promise<PacketCases> {
  const [agendaRows, owners, agendaDocs] = await Promise.all([
    agendaOf(db, input.meetingId),
    input.documentIds.length === 0
      ? []
      : db
          .select({
            id: documents.id,
            recordKind: documents.recordKind,
            recordId: documents.recordId,
          })
          .from(documents)
          .where(inArray(documents.id, input.documentIds)),
    input.meetingId === null ? new Set<string>() : agendaDocumentIds(db, input.meetingId),
  ])
  const ownerOf = new Map(
    owners.flatMap((o) => (o.recordKind === 'application' ? [[o.id, o.recordId] as const] : [])),
  )
  const facts = await applicationFacts(db, [...new Set(ownerOf.values())])
  const itemFor = new Map<string, string>()
  for (const row of agendaRows) {
    if (row.applicationId !== null && !itemFor.has(row.applicationId)) {
      itemFor.set(row.applicationId, row.id)
    }
  }
  return {
    agenda: agendaRows.map((row) => ({ id: row.id, number: row.position + 1, title: row.title })),
    caseOf: (documentId) => {
      if (agendaDocs.has(documentId)) return { ...NO_CASE, isAgenda: true }
      const applicationId = ownerOf.get(documentId)
      const fact = applicationId === undefined ? undefined : facts.get(applicationId)
      if (applicationId === undefined || fact === undefined) return NO_CASE
      return { ...fact, isAgenda: false, agendaItemId: itemFor.get(applicationId) ?? null }
    },
  }
}
