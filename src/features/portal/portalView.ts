import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  applicationConditions,
  clocks,
  ledgerAllocations,
  ledgerEntries,
  parcels,
  projects,
  receipts,
} from '@/db/schema'
import { canViewApplication, isProjectParty } from '@/features/access/queries'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { stateLabel } from '@/features/applications/stateLabel'
import type { CoreState } from '@/features/applications/states'
import { attestationHash } from '@/features/applications/submitApplication'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { listDocuments } from '@/features/documents/listDocuments'
import type { DocumentListRow } from '@/features/documents/types'
import { previewFees } from '@/features/fees/preview'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer } from '@/features/honest/honest'
import { type FeeBalance, feeBalance } from '@/features/ledger/feeBalance'
import { ledgerEntryVisibleTo } from '@/features/ledger/visibility'
import { displayIdsFor } from '@/features/parcels/displayId'
import { computeConvenienceFee } from '@/features/payments/convenienceFee'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const DECISION_CLOCK_KEY = 'nh.bp.decision'
const PAYER_ROLES = ['applicant', 'owner', 'agent', 'contractor'] as const
const WRITABLE_STATES: readonly CoreState[] = ['draft', 'submitted']
const ESTIMATE_STATES: readonly CoreState[] = ['draft', 'submitted', 'under_review']
const DOCUMENT_LIMIT = 50

export interface PortalApplicationView {
  applicationId: string
  projectId: string
  number: string
  typeLabel: string
  state: CoreState
  stateLabel: string
  parcel: { id: string; displayId: string | null; siteAddress: HonestValue<string> }
  form: FormBody | null
  values: Record<string, FieldValue>
  attestationText: string
  attestationSha256: string
  decisionDue: { date: CivilDate; consequence: string } | null
  conditions: { text: string; status: 'unmet' | 'met' | 'waived' }[]
  documents: DocumentListRow[]
  fees: FeeBalance
  feeEstimate: { totalCents: number; due: 'at_intake' | 'at_approval' } | null
  onlineTotalCents: number
  convenienceCents: number
  canPay: boolean
  history: PortalMoneyEntry[]
  canEdit: boolean
  canUpload: boolean
}

const DECISION_LATE_TEXT =
  'That date has passed. Call the land use office to ask when to expect the decision.'

async function decisionDue(db: Db, applicationId: string, signal: AbortSignal) {
  const [clock] = await db
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, DECISION_CLOCK_KEY),
        inArray(clocks.status, ['running', 'overdue']),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  if (clock === undefined) return null
  const date = clock.currentDue as CivilDate
  const today = await townToday(db, new Date(), signal)
  return {
    date,
    consequence: compareCivil(today, date) > 0 ? DECISION_LATE_TEXT : '',
  }
}

export interface PortalMoneyEntry {
  entryId: string
  entryType: string
  method: string
  checkNumber: string | null
  amountCents: number
  convenienceCents: number
  date: string
  receiptId: string | null
  receiptNumber: string | null
}

async function historyFor(
  db: Db,
  actor: Actor,
  applicationId: string,
): Promise<PortalMoneyEntry[]> {
  const rows = await db
    .select({
      entryId: ledgerEntries.id,
      entryType: ledgerEntries.entryType,
      method: ledgerEntries.method,
      checkNumber: ledgerEntries.checkNumber,
      amountCents: sql<number>`sum(${ledgerAllocations.amountCents})::int`,
      convenienceCents: sql<
        number | null
      >`(sum(${ledgerAllocations.amountCents}) filter (where ${ledgerAllocations.targetKind} = 'convenience_fee'))::int`,
      date: ledgerEntries.businessDate,
      postedAt: ledgerEntries.postedAt,
      receiptId: ledgerEntries.receiptId,
      receiptNumber: receipts.number,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAllocations, eq(ledgerAllocations.entryId, ledgerEntries.id))
    .leftJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(and(eq(ledgerAllocations.applicationId, applicationId), ledgerEntryVisibleTo(actor)))
    .groupBy(ledgerEntries.id, receipts.number)
    .orderBy(desc(ledgerEntries.postedAt), desc(ledgerEntries.id))
  return rows.map(({ postedAt: _postedAt, ...r }) => ({
    ...r,
    convenienceCents: r.convenienceCents ?? 0,
  }))
}

async function feeEstimate(
  db: Db,
  app: ApplicationContext,
  signal: AbortSignal,
): Promise<PortalApplicationView['feeEstimate']> {
  if (!ESTIMATE_STATES.includes(app.state)) return null
  const preview = await previewFees(db, app, signal)
  if (preview?.complete !== true || preview.totalCents === null || preview.totalCents <= 0) {
    return null
  }
  return { totalCents: preview.totalCents, due: app.typeBody.payTiming }
}

export async function getPortalApplicationView(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<PortalApplicationView, 'not_found'>> {
  signal.throwIfAborted()
  if (!isUuid(applicationId)) return err('not_found')
  if (!(await canViewApplication(db, actor, applicationId, signal))) return err('not_found')
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return err('not_found')
  const [project] = await db
    .select({ parcelId: projects.parcelId })
    .from(projects)
    .where(eq(projects.id, app.projectId))
  const [parcel] = await db
    .select({ siteAddress: parcels.siteAddress })
    .from(parcels)
    .where(eq(parcels.id, project?.parcelId ?? ''))
  const layer = await getLayerStatus(db, 'parcels', now, signal)
  const display = await displayIdsFor(db, project === undefined ? [] : [project.parcelId])
  const formVersion = await getVersion(db, app.pins.form, signal)
  const fullForm = formVersion?.body as FormBody | undefined
  const form = fullForm === undefined ? null : hideStaffOnly(fullForm)
  const staffKeys = new Set(
    (fullForm?.fields ?? []).filter((f) => f.staffOnly === true).map((f) => f.key),
  )
  const fees = await feeBalance(db, applicationId, signal)
  const isParty = hasFullRecordAccess(actor)
    ? false
    : await isActiveParty(db, actor.userId, app.projectId)
  const payer = await isProjectParty(db, actor, app.projectId, [...PAYER_ROLES], signal)
  const settings = await getPaymentSettings(db, signal)
  const convenienceCents = computeConvenienceFee(
    fees.dueCents,
    settings.convenienceFee,
    'card_online',
  )
  const writable = WRITABLE_STATES.includes(app.state)
  const conditions = await db
    .select()
    .from(applicationConditions)
    .where(eq(applicationConditions.applicationId, applicationId))
    .orderBy(asc(applicationConditions.changedAt))
  return ok({
    applicationId,
    projectId: app.projectId,
    number: app.number,
    typeLabel: app.typeBody.label,
    state: app.state,
    stateLabel: stateLabel(app.state),
    parcel: {
      id: project?.parcelId ?? '',
      displayId: project === undefined ? null : (display.get(project.parcelId) ?? null),
      siteAddress: honestFromLayer(layer, parcel?.siteAddress ?? null),
    },
    form,
    values: Object.fromEntries(Object.entries(app.values).filter(([k]) => !staffKeys.has(k))),
    attestationText: app.typeBody.attestationText,
    attestationSha256: attestationHash(app.typeBody.attestationText),
    decisionDue: await decisionDue(db, applicationId, signal),
    conditions: conditions.map((c) => ({ text: c.textSnapshot, status: c.status })),
    documents: (
      await listDocuments(
        db,
        actor,
        { record: { kind: 'application', id: applicationId }, limit: DOCUMENT_LIMIT },
        signal,
      )
    ).rows,
    fees,
    feeEstimate: await feeEstimate(db, app, signal),
    onlineTotalCents: fees.dueCents + convenienceCents,
    convenienceCents,
    canPay: fees.dueCents > 0 && payer,
    history: await historyFor(db, actor, applicationId),
    canEdit: app.state === 'draft' && isParty,
    canUpload: writable && isParty,
  })
}

function hideStaffOnly(form: FormBody): FormBody {
  return { ...form, fields: form.fields.filter((f) => f.staffOnly !== true) }
}
