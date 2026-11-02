import type { ClockRule } from '@packs/nh/schema'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  appeals,
  applicationConditions,
  clockAdjustments,
  clocks,
  codeEditionRecords,
  feeAssessments,
  feeOverrides,
  projectParties,
  projects,
  regionalImpactDeterminations,
  regionalImpactNotices,
} from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import {
  CORE_TRANSITIONS,
  type CoreState,
  isTransitionAllowed,
} from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { describeCodeEdition, type EditionDescription } from '@/features/building/codeEdition'
import { codeEditionPanelRows } from '@/features/building/editionPanelRows'
import { type ClockExplanation, explainClock } from '@/features/clocks/explainClock'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import { effectiveBindings } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import type { FeeComputation } from '@/features/fees/computeFees'
import { previewFees } from '@/features/fees/preview'
import { evaluateGates, type GateResult } from '@/features/gates/evaluateGates'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { displayIdsFor } from '@/features/parcels/displayId'
import { hasFullRecordAccess } from '@/features/projects/access'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'

const MANUAL_TARGETS_EXCLUDED: readonly CoreState[] = ['suspended', 'expired', 'submitted']

export interface StaffApplicationView {
  id: string
  number: string
  typeKey: string
  typeLabel: string
  state: CoreState
  substep: string | null
  substeps: { key: string; label: string }[]
  rowVersion: number
  projectId: string
  projectTitle: string
  parcelId: string
  parcelDisplayId: string
  today: CivilDate
  receivedDate: CivilDate | null
  completedDate: CivilDate | null
  issuedOn: CivilDate | null
  parties: {
    id: string
    name: string
    role: string
    ownerAuthorizationOnFile: boolean
    linked: boolean
  }[]
  clocks: (ClockExplanation & { clockId: string })[]
  nextTransitions: CoreState[]
  gates: { to: CoreState; results: GateResult[] }[]
  conditions: (typeof applicationConditions.$inferSelect)[]
  conditionLibrary: { code: string; text: string; blocksIssuance: boolean }[]
  classification: string | null
  fees: {
    assessments: (typeof feeAssessments.$inferSelect)[]
    overrides: (typeof feeOverrides.$inferSelect)[]
    preview: FeeComputation | null
  }
  codeEdition: {
    record: typeof codeEditionRecords.$inferSelect
    description: EditionDescription
    rows: { field: string; value: string }[]
  } | null
  regionalImpact: {
    applies: boolean
    determination: typeof regionalImpactDeterminations.$inferSelect | null
    notices: (typeof regionalImpactNotices.$inferSelect)[]
  }
  appeals: (typeof appeals.$inferSelect)[]
  permissions: {
    canIssue: boolean
    canAdjustClock: boolean
    canOverrideGate: boolean
    canRecordStatutoryException: boolean
    canOverrideFee: boolean
    canDetermineRegionalImpact: boolean
  }
}

async function permissionsOf(db: Db, actor: Actor, signal: AbortSignal) {
  const has = (c: Parameters<typeof hasCapability>[2]) => hasCapability(db, actor.userId, c, signal)
  return {
    canIssue: await has('permit.issue'),
    canAdjustClock: await has('clock.adjust'),
    canOverrideGate: await has('gate.override_admin'),
    canRecordStatutoryException: await has('gate.record_statutory_exception'),
    canOverrideFee: await has('fee.override'),
    canDetermineRegionalImpact: await has('regional_impact.determine'),
  }
}

async function clockExplanations(db: Db, applicationId: string, today: CivilDate) {
  const pack = loadPack()
  const rows = await db
    .select()
    .from(clocks)
    .where(eq(clocks.applicationId, applicationId))
    .orderBy(asc(clocks.createdAt))
  const out: StaffApplicationView['clocks'] = []
  for (const clock of rows) {
    const rule = ruleByKey(pack, clock.ruleKey, clock.ruleVersion)
    if (rule.kind !== 'clock') continue
    const adjustments = await db
      .select()
      .from(clockAdjustments)
      .where(eq(clockAdjustments.clockId, clock.id))
      .orderBy(asc(clockAdjustments.createdAt))
    out.push({ ...explainClock(clock, adjustments, rule, today), clockId: clock.id })
  }
  return out
}

export async function getStaffApplicationView(
  db: Db,
  actor: Actor,
  applicationId: string,
  now: Date,
  signal: AbortSignal,
): Promise<StaffApplicationView | null> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return null
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  const today = await townToday(db, now, signal)
  const [project] = await db.select().from(projects).where(eq(projects.id, app.projectId))
  if (project === undefined) return null
  const display = await displayIdsFor(db, [project.parcelId])
  const nextTransitions = CORE_TRANSITIONS[app.state].filter(
    (to) =>
      !MANUAL_TARGETS_EXCLUDED.includes(to) &&
      !(app.state === 'suspended' && to === 'issued') &&
      isTransitionAllowed(app.state, to, app.typeBody.workflow),
  )
  const gates = await db.transaction(async (tx) => {
    const out: StaffApplicationView['gates'] = []
    for (const to of nextTransitions)
      out.push({ to, results: await evaluateGates(tx, app, to, today, signal) })
    return out
  })
  const assessments = await db
    .select()
    .from(feeAssessments)
    .where(eq(feeAssessments.applicationId, applicationId))
    .orderBy(asc(feeAssessments.assessedAt))
  const overrides = await db
    .select()
    .from(feeOverrides)
    .where(and(eq(feeOverrides.applicationId, applicationId), isNull(feeOverrides.supersededBy)))
  const preview = await previewFees(db, app, signal)
  const libraryVersion = await getVersion(db, app.pins.conditionLibrary, signal)
  const library = (libraryVersion?.body as ConditionLibraryBody | undefined)?.conditions ?? []
  const [record] = await db
    .select()
    .from(codeEditionRecords)
    .where(eq(codeEditionRecords.applicationId, applicationId))
  const pack = loadPack()
  const editionEntry =
    record === undefined ? undefined : pack.codeEditions.find((e) => e.key === record.editionKey)
  const recordRule = pack.rules.find((r) => r.key === 'nh.bp.code_edition')
  const [determination] = await db
    .select()
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, applicationId))
  return {
    id: app.id,
    number: app.number,
    typeKey: app.typeBody.key,
    typeLabel: app.typeBody.label,
    state: app.state,
    substep: app.substep,
    substeps: app.typeBody.workflow.substeps
      .filter((s) => s.state === app.state)
      .map((s) => ({ key: s.key, label: s.label })),
    rowVersion: app.rowVersion,
    projectId: project.id,
    projectTitle: project.title,
    parcelId: project.parcelId,
    parcelDisplayId: display.get(project.parcelId) ?? 'No map-lot ID',
    today,
    receivedDate: app.receivedDate,
    completedDate: app.completedDate,
    issuedOn: app.issuedOn,
    parties: (
      await db
        .select()
        .from(projectParties)
        .where(and(eq(projectParties.projectId, app.projectId), isNull(projectParties.removedAt)))
    ).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      ownerAuthorizationOnFile: p.ownerAuthorizationOnFile,
      linked: p.userId !== null,
    })),
    clocks: await clockExplanations(db, applicationId, today),
    nextTransitions,
    gates,
    conditionLibrary: library,
    classification: app.typeBody.classification ?? null,
    conditions: await db
      .select()
      .from(applicationConditions)
      .where(eq(applicationConditions.applicationId, applicationId))
      .orderBy(asc(applicationConditions.changedAt)),
    fees: { assessments, overrides, preview },
    codeEdition:
      record === undefined || editionEntry === undefined || recordRule?.kind !== 'required_record'
        ? null
        : {
            record,
            description: describeCodeEdition(editionEntry, record.receiptDate as CivilDate),
            rows: codeEditionPanelRows(recordRule, record),
          },
    regionalImpact: {
      applies: effectiveBindings(app.typeBody, pack).includes('nh.bp.regional_impact'),
      determination: determination ?? null,
      notices: await db
        .select()
        .from(regionalImpactNotices)
        .where(eq(regionalImpactNotices.applicationId, applicationId))
        .orderBy(desc(regionalImpactNotices.mailedOn)),
    },
    appeals: await db
      .select()
      .from(appeals)
      .where(eq(appeals.applicationId, applicationId))
      .orderBy(asc(appeals.filedOn)),
    permissions: await permissionsOf(db, actor, signal),
  }
}
