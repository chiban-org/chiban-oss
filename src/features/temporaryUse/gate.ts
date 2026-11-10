import { and, eq, inArray, ne } from 'drizzle-orm'
import { applications, projects } from '@/db/schema'
import { registerGate } from '@/features/gates/registry'
import { temporaryUseRefusals, type UseDates } from '@/features/temporaryUse/limits'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'

export const TEMPORARY_USE_GATE_KEY = 'temporary_use.limits'
export const TEMPORARY_USE_TYPE_KEY = 'TUP'
const COUNTED_STATES = ['submitted', 'under_review', 'decided', 'issued', 'suspended', 'closed']

function civil(value: unknown): CivilDate | null {
  if (typeof value !== 'string') return null
  const parsed = parseCivilDate(value)
  return parsed.ok ? parsed.value : null
}

function datesOf(values: Record<string, unknown>): UseDates | null {
  const start = civil(values.start_date)
  const end = civil(values.end_date)
  return start === null || end === null ? null : { start, end }
}

registerGate({
  key: TEMPORARY_USE_GATE_KEY,
  label: 'Temporary use limits',
  kind: 'administrative',
  appliesTo: ['submitted'],
  boundBy: null,
  relevantTo: (app) => app.typeBody.key === TEMPORARY_USE_TYPE_KEY,
  evaluate: async (tx, app, today) => {
    const dates = datesOf(app.values)
    if (dates === null) return { status: 'pass' }
    const [project] = await tx
      .select({ parcelId: projects.parcelId })
      .from(projects)
      .where(eq(projects.id, app.projectId))
    if (project === undefined) return { status: 'pass' }
    const rows = await tx
      .select({ values: applications.values })
      .from(applications)
      .innerJoin(projects, eq(projects.id, applications.projectId))
      .where(
        and(
          eq(projects.parcelId, project.parcelId),
          eq(applications.applicationTypeKey, TEMPORARY_USE_TYPE_KEY),
          ne(applications.id, app.id),
          inArray(applications.state, COUNTED_STATES),
        ),
      )
    const others = rows.flatMap((r) => {
      const found = datesOf(r.values as Record<string, unknown>)
      return found === null ? [] : [found]
    })
    const refusals = temporaryUseRefusals({ ...dates, today, others })
    return refusals.length === 0
      ? { status: 'pass' }
      : { status: 'blocked', reason: refusals.join(' ') }
  },
})
