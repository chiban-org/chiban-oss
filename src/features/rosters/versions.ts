import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { auditLog, users } from '@/db/schema'
import type { EntryKind } from '@/features/rosters/confirm'
import { listDatedText } from '@/features/rosters/recheck'
import { formatCivilDate } from '@/lib/formatDate'
import { todayInTimeZone } from '@/types/civilDate'

export interface EarlierVersion {
  changedText: string
  lines: string[]
}

type Before = Record<string, unknown>

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function people(value: unknown, middle: 'title' | 'siteLabel'): string[] {
  if (typeof value === 'number') return [`${value} on the roster`]
  if (!Array.isArray(value)) return []
  return value.map((p: Before) =>
    [text(p.name), text(middle === 'title' ? p.title : p.siteLabel), text(p.mailingAddress)]
      .filter((s) => s !== '')
      .join(', '),
  )
}

function asOfLine(before: Before): string[] {
  return typeof before.asOf === 'string' ? [listDatedText(before.asOf)] : []
}

export function versionLines(kind: EntryKind, before: Before): string[] {
  if (kind === 'association') {
    return [text(before.associationName), ...people(before.officers, 'title'), ...asOfLine(before)]
  }
  if (kind === 'park') {
    const owner = [text(before.ownerName), text(before.ownerMailingAddress)]
      .filter((s) => s !== '')
      .join(', ')
    return [
      text(before.parkName),
      ...(owner === '' ? [] : [`Owner: ${owner}`]),
      ...people(before.tenants, 'siteLabel'),
      ...asOfLine(before),
    ].filter((s) => s !== '')
  }
  const holder = [text(before.holderName), text(before.holderMailingAddress)]
    .filter((s) => s !== '')
    .join(', ')
  const ended =
    'endedOn' in before
      ? [before.endedOn === null ? 'Not ended' : `Ended ${formatCivilDate(text(before.endedOn))}`]
      : []
  return [holder, text(before.recordedReference), ...ended].filter((s) => s !== '')
}

const CHANGE_ACTIONS: Record<EntryKind, string[]> = {
  association: ['roster.association.update', 'roster.association.upsert'],
  park: ['roster.park.update', 'roster.park.upsert'],
  restriction: [
    'roster.restriction.update',
    'roster.restriction.end',
    'roster.restriction.undo_end',
  ],
}

export async function earlierVersions(
  db: DbOrTx,
  input: { kind: EntryKind; parcelIds: string[]; timeZone: string },
): Promise<Map<string, (EarlierVersion & { entryKey: string })[]>> {
  const found = new Map<string, (EarlierVersion & { entryKey: string })[]>()
  if (input.parcelIds.length === 0) return found
  const rows = await db
    .select({
      at: auditLog.at,
      entityId: auditLog.entityId,
      before: auditLog.before,
      who: users.displayName,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(
        eq(auditLog.entityType, 'parcel'),
        inArray(auditLog.entityId, input.parcelIds),
        inArray(auditLog.action, CHANGE_ACTIONS[input.kind]),
        isNotNull(auditLog.before),
      ),
    )
    .orderBy(desc(auditLog.at))
  for (const row of rows) {
    const before = row.before as Before
    const entryKey = input.kind === 'restriction' ? text(before.holdingId) : row.entityId
    const changed = formatCivilDate(todayInTimeZone(input.timeZone, row.at))
    const version = {
      entryKey,
      changedText: `Replaced ${changed}${row.who === null ? '' : ` by ${row.who}`}`,
      lines: versionLines(input.kind, before),
    }
    found.set(entryKey, [...(found.get(entryKey) ?? []), version])
  }
  return found
}
