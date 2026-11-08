import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Capability } from '@/constants/capabilities'
import type { DbOrTx } from '@/db/client'
import { roleCapabilities, type SCHEDULABLE_REPORTS, userRoles, users } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'

export type ScheduledReport = (typeof SCHEDULABLE_REPORTS)[number]

export const SCHEDULE_CAPABILITY: Capability = 'report.view'
const MONEY_CAPABILITY: Capability = 'payment.report'

const NEEDS: ReadonlyMap<ScheduledReport, readonly Capability[]> = new Map([
  ['permit-volume', [SCHEDULE_CAPABILITY]],
  ['processing-time', [SCHEDULE_CAPABILITY]],
  ['census', [SCHEDULE_CAPABILITY]],
  ['revenue', [SCHEDULE_CAPABILITY, MONEY_CAPABILITY]],
  ['cash-receipts', [MONEY_CAPABILITY]],
])

export function capabilitiesFor(report: ScheduledReport): readonly Capability[] {
  return NEEDS.get(report) ?? [SCHEDULE_CAPABILITY]
}

export async function canUseReport(
  db: DbOrTx,
  userId: string,
  report: ScheduledReport,
  signal: AbortSignal,
): Promise<boolean> {
  for (const capability of capabilitiesFor(report)) {
    if (!(await hasCapability(db, userId, capability, signal))) return false
  }
  return true
}

export async function canManageSchedule(
  db: DbOrTx,
  userId: string,
  report: ScheduledReport,
  signal: AbortSignal,
): Promise<boolean> {
  return (
    (await hasCapability(db, userId, SCHEDULE_CAPABILITY, signal)) &&
    (await canUseReport(db, userId, report, signal))
  )
}

export interface RecipientChoice {
  id: string
  name: string
  capabilities: Capability[]
}

const REPORT_CAPABILITIES: Capability[] = [SCHEDULE_CAPABILITY, MONEY_CAPABILITY]

export async function recipientChoices(db: DbOrTx): Promise<RecipientChoice[]> {
  const rows = await db
    .selectDistinct({
      id: users.id,
      name: users.displayName,
      capability: roleCapabilities.capability,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roleCapabilities, eq(roleCapabilities.role, userRoles.role))
    .where(
      and(
        eq(users.isActive, true),
        eq(users.kind, 'staff'),
        inArray(roleCapabilities.capability, REPORT_CAPABILITIES),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.id))
  const byId = new Map<string, RecipientChoice>()
  for (const row of rows) {
    const choice = byId.get(row.id) ?? { id: row.id, name: row.name, capabilities: [] }
    choice.capabilities.push(row.capability as Capability)
    byId.set(row.id, choice)
  }
  return [...byId.values()]
}

export function mayReceive(choice: RecipientChoice, report: ScheduledReport): boolean {
  return capabilitiesFor(report).every((c) => choice.capabilities.includes(c))
}
