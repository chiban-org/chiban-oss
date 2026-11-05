import { and, desc, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationConditions,
  clocks,
  codeEditionRecords,
  parcels,
  projectParties,
  projects,
} from '@/db/schema'
import { formApplicantName, namedParty } from '@/features/applications/applicantName'
import type { ApplicationContext } from '@/features/applications/context'
import { loadApplicationContext } from '@/features/applications/context'
import { getVersion } from '@/features/config/store'
import { feeBalance } from '@/features/ledger/feeBalance'
import { displayIdsFor } from '@/features/parcels/displayId'
import { correctionMark } from '@/features/permits/correction/mark'
import type { MergeContext } from '@/features/templates/renderTemplate'
import type { TemplateBody } from '@/features/templates/templateSchema'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

const EXPIRATION_RULE_KEY = 'town.bp.expiration'
export const NOT_APPLICABLE = 'Not applicable'

export interface PermitData {
  application: ApplicationContext
  townName: string
  parcelDisplayId: string
  siteAddress: string
  ownerName: string
  projectTitle: string
  applicantName: string
  contractorName: string
  licenseNumber: string
  issuedOn: string
  expiresOn: string
  conditions: string[]
  codeEdition: string
  feesTotal: string
  feeStatus: string
  permitTemplate: TemplateBody | null
  correctionMark: string | null
}

async function partyName(db: DbOrTx, projectId: string, role: 'applicant' | 'contractor') {
  const [row] = await db
    .select({ name: projectParties.name })
    .from(projectParties)
    .where(
      and(
        eq(projectParties.projectId, projectId),
        eq(projectParties.role, role),
        isNull(projectParties.removedAt),
      ),
    )
    .orderBy(projectParties.addedAt)
    .limit(1)
  return row?.name ?? ''
}

async function feeFigures(db: DbOrTx, applicationId: string, signal: AbortSignal) {
  const balance = await feeBalance(db, applicationId, signal)
  const totalCents = balance.lines.reduce((sum, l) => sum + l.assessedCents, 0)
  const status =
    totalCents === 0
      ? 'None assessed'
      : balance.dueCents === 0
        ? `${formatCents(totalCents)}, paid in full`
        : `${formatCents(totalCents)}, ${formatCents(balance.dueCents)} not yet paid`
  return { total: formatCents(totalCents), status }
}

async function expiresOn(db: DbOrTx, applicationId: string): Promise<string> {
  const [clock] = await db
    .select({ currentDue: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, EXPIRATION_RULE_KEY),
        isNull(clocks.supersededBy),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  return clock === undefined ? NOT_APPLICABLE : formatCivilDate(clock.currentDue)
}

async function permitTemplate(
  db: DbOrTx,
  templateIds: string[],
  signal: AbortSignal,
): Promise<TemplateBody | null> {
  for (const id of templateIds) {
    const version = await getVersion(db, id, signal)
    const body = version?.body as TemplateBody | undefined
    if (body?.kind === 'permit') return body
  }
  return null
}

export async function loadPermitData(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<PermitData | null> {
  const application = await loadApplicationContext(db, applicationId, signal)
  if (application === null) return null
  const [project] = await db.select().from(projects).where(eq(projects.id, application.projectId))
  if (project === undefined) return null
  const [parcel] = await db.select().from(parcels).where(eq(parcels.id, project.parcelId))
  const display = await displayIdsFor(db, [project.parcelId])
  const town = await getTownSettings(db, signal)
  const edition = await db
    .select({ label: codeEditionRecords.editionLabel })
    .from(codeEditionRecords)
    .where(eq(codeEditionRecords.applicationId, applicationId))
  const conditions = await db
    .select()
    .from(applicationConditions)
    .where(eq(applicationConditions.applicationId, applicationId))
  const license = application.values.contractor_license_number
  const fees = await feeFigures(db, applicationId, signal)
  return {
    application,
    townName: town.ok ? town.value.name : '',
    parcelDisplayId: display.get(project.parcelId) ?? '',
    siteAddress: parcel?.siteAddress ?? '',
    ownerName: parcel?.ownerName ?? '',
    projectTitle: project.title,
    applicantName:
      formApplicantName(application.values) ??
      namedParty(await partyName(db, project.id, 'applicant')) ??
      '',
    contractorName: await partyName(db, project.id, 'contractor'),
    licenseNumber: typeof license === 'string' ? license : '',
    issuedOn: application.issuedOn === null ? '' : formatCivilDate(application.issuedOn),
    expiresOn: await expiresOn(db, applicationId),
    conditions: conditions.map((c) => c.textSnapshot),
    codeEdition: edition[0]?.label ?? '',
    feesTotal: fees.total,
    feeStatus: fees.status,
    permitTemplate: await permitTemplate(db, application.pins.templates, signal),
    correctionMark: correctionMark(application.permitRevision, application.permitCorrectedOn),
  }
}

export function mergeContextOf(data: PermitData): MergeContext {
  return {
    'town.name': data.townName,
    'application.number': data.application.number,
    'application.typeLabel': data.application.typeBody.label,
    'application.issuedOn': data.issuedOn,
    'application.expiresOn': data.expiresOn,
    'parcel.displayId': data.parcelDisplayId,
    'parcel.siteAddress': data.siteAddress,
    'parcel.ownerName': data.ownerName,
    'project.title': data.projectTitle,
    'party.applicant.name': data.applicantName,
    'party.contractor.name': data.contractorName,
    'fees.totalFormatted': data.feesTotal,
    'conditions.list': data.conditions.join('; '),
    'codeEdition.label': data.codeEdition,
  }
}
