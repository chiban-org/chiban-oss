import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
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
import { loadApplicationContext } from '@/features/applications/context'
import { stateLabel } from '@/features/applications/stateLabel'
import type { CoreState } from '@/features/applications/states'
import { attestationHash } from '@/features/applications/submitApplication'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { listDocuments } from '@/features/documents/listDocuments'
import type { DocumentListRow } from '@/features/documents/types'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer } from '@/features/honest/honest'
import { type FeeBalance, feeBalance } from '@/features/ledger/feeBalance'
import { ledgerEntryVisibleTo } from '@/features/ledger/visibility'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { displayIdsFor } from '@/features/parcels/displayId'
import { computeConvenienceFee } from '@/features/payments/convenienceFee'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const DECISION_CLOCK_KEY = 'nh.bp.decision'
const PAYER_ROLES = ['applicant', 'owner', 'agent', 'contractor'] as const
const WRITABLE_STATES: readonly CoreState[] = ['draft', 'submitted']
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
  onlineTotalCents: number
  convenienceCents: number
  canPay: boolean
  receipts: { receiptId: string; number: string; totalCents: number; date: string }[]
  canEdit: boolean
  canUpload: boolean
}

async function decisionDue(db: Db, applicationId: string) {
  const [clock] = await db
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, DECISION_CLOCK_KEY),
        eq(clocks.status, 'running'),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  if (clock === undefined) return null
  const rule = ruleByKey(loadPack(), clock.ruleKey, clock.ruleVersion)
  return {
    date: clock.currentDue as CivilDate,
    consequence: rule.kind === 'clock' ? rule.consequence.text : '',
  }
}

async function receiptsFor(db: Db, actor: Actor, applicationId: string) {
  const rows = await db
    .select({
      receiptId: receipts.id,
      number: receipts.number,
      totalCents: sql<number>`sum(${ledgerAllocations.amountCents})::int`,
      date: receipts.businessDate,
      issuedAt: receipts.issuedAt,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerAllocations, eq(ledgerAllocations.entryId, ledgerEntries.id))
    .innerJoin(receipts, eq(receipts.id, ledgerEntries.receiptId))
    .where(
      and(
        eq(ledgerAllocations.applicationId, applicationId),
        isNotNull(ledgerEntries.receiptId),
        eq(ledgerEntries.entryType, 'payment'),
        ledgerEntryVisibleTo(actor),
      ),
    )
    .groupBy(receipts.id)
    .orderBy(desc(receipts.issuedAt))
  return rows.map(({ issuedAt: _issuedAt, ...r }) => r)
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
    decisionDue: await decisionDue(db, applicationId),
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
    onlineTotalCents: fees.dueCents + convenienceCents,
    convenienceCents,
    canPay: fees.dueCents > 0 && payer,
    receipts: await receiptsFor(db, actor, applicationId),
    canEdit: app.state === 'draft' && isParty,
    canUpload: writable && isParty,
  })
}

function hideStaffOnly(form: FormBody): FormBody {
  return { ...form, fields: form.fields.filter((f) => f.staffOnly !== true) }
}
