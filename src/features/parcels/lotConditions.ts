import { and, eq, inArray, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applicationConditions, applications, projects } from '@/db/schema'
import { expiryDates } from '@/features/applications/expiryDates'
import type { Status } from '@/features/design/tokens'
import { type LatestDecision, latestDecisions } from '@/features/parcels/boardOutcomes'
import { decisionOutcome } from '@/features/parcels/openGroups'
import type { CivilDate } from '@/types/civilDate'

export interface LotCondition {
  code: string
  text: string
}

export interface LotDecision {
  applicationId: string
  number: string
  outcome: { label: string; chip: Status }
  decidedOn: CivilDate | null
  expires: CivilDate | null
  conditions: LotCondition[]
}

const STANDING_STATES = ['issued', 'suspended', 'decided', 'denied'] as const
const PERMIT_WORDS = new Map<string, { label: string; chip: Status }>([
  ['issued', { label: 'Issued', chip: 'passed' }],
  ['suspended', { label: 'Suspended', chip: 'overdue' }],
])

interface StandingApp {
  id: string
  number: string
  state: string
  issuedOn: string | null
}

function merged(first: readonly LotCondition[], then: readonly LotCondition[]): LotCondition[] {
  const codes = new Set(first.map((c) => c.code))
  return [...first, ...then.filter((c) => !codes.has(c.code))]
}

function decisionEntry(
  app: StandingApp,
  decision: LatestDecision,
  own: readonly LotCondition[],
): Omit<LotDecision, 'expires'> {
  return {
    applicationId: app.id,
    number: app.number,
    outcome: decisionOutcome(decision.outcome, decision.boardKind),
    decidedOn: decision.votedOn,
    conditions: merged(
      decision.conditions.map((c) => ({ code: c.code, text: c.text })),
      own,
    ),
  }
}

function permitEntry(
  app: StandingApp,
  own: readonly LotCondition[],
): Omit<LotDecision, 'expires'> | null {
  const outcome = PERMIT_WORDS.get(app.state)
  if (outcome === undefined || own.length === 0) return null
  return {
    applicationId: app.id,
    number: app.number,
    outcome,
    decidedOn: app.issuedOn as CivilDate | null,
    conditions: [...own],
  }
}

async function conditionsByApplication(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, LotCondition[]>> {
  const rows = await db
    .select({
      applicationId: applicationConditions.applicationId,
      code: applicationConditions.code,
      text: applicationConditions.textSnapshot,
    })
    .from(applicationConditions)
    .where(
      and(
        inArray(applicationConditions.applicationId, ids),
        ne(applicationConditions.status, 'waived'),
      ),
    )
    .orderBy(applicationConditions.code)
  const out = new Map<string, LotCondition[]>()
  for (const row of rows) {
    out.set(row.applicationId, [
      ...(out.get(row.applicationId) ?? []),
      { code: row.code, text: row.text },
    ])
  }
  return out
}

export async function loadLotConditions(
  db: DbOrTx,
  parcelId: string,
  signal: AbortSignal,
): Promise<LotDecision[]> {
  signal.throwIfAborted()
  const apps = await db
    .select({
      id: applications.id,
      number: applications.number,
      state: applications.state,
      issuedOn: applications.issuedOn,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(and(eq(projects.parcelId, parcelId), inArray(applications.state, STANDING_STATES)))
  const ids = apps.map((a) => a.id)
  if (ids.length === 0) return []
  const decisions = await latestDecisions(db, ids)
  const own = await conditionsByApplication(db, ids)
  const expiries = await expiryDates(db, ids)
  return apps
    .flatMap((app) => {
      const decision = decisions.get(app.id)
      const conditions = own.get(app.id) ?? []
      const entry =
        decision === undefined
          ? permitEntry(app, conditions)
          : decisionEntry(app, decision, conditions)
      return entry === null ? [] : [{ ...entry, expires: expiries.get(app.id) ?? null }]
    })
    .sort(
      (a, b) =>
        (b.decidedOn ?? '').localeCompare(a.decidedOn ?? '') || a.number.localeCompare(b.number),
    )
}
