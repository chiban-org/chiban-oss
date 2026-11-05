import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { configVersions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { getBoardSettings } from '@/features/boards/boardSettings'
import { publishConfig } from '@/features/config/publish'
import { saveDraft } from '@/features/config/store'
import { err, ok, type Result } from '@/types/result'

export const RECHECK_MIN_DAYS = 1
export const RECHECK_MAX_DAYS = 3650

export type RecheckIntervalError = 'invalid_days' | 'draft_pending' | 'forbidden'

export function parseRecheckDays(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null
  const days = Number(raw)
  return days >= RECHECK_MIN_DAYS && days <= RECHECK_MAX_DAYS ? days : null
}

async function hasPendingDraft(db: Db): Promise<boolean> {
  const [draft] = await db
    .select({ id: configVersions.id })
    .from(configVersions)
    .where(
      and(
        eq(configVersions.kind, 'board_settings'),
        eq(configVersions.key, 'default'),
        eq(configVersions.status, 'draft'),
      ),
    )
  return draft !== undefined
}

export async function publishRecheckDays(
  db: Db,
  actor: Actor,
  days: number,
  signal: AbortSignal,
): Promise<Result<{ version: number }, RecheckIntervalError>> {
  if (parseRecheckDays(String(days)) === null) return err('invalid_days')
  if (await hasPendingDraft(db)) return err('draft_pending')
  const current = await getBoardSettings(db, signal)
  const body = { ...current, abutters: { ...current.abutters, recheckContactsDays: days } }
  const saved = await saveDraft(db, actor, { kind: 'board_settings', key: 'default', body }, signal)
  if (!saved.ok) return err(saved.error === 'forbidden' ? 'forbidden' : 'invalid_days')
  const published = await publishConfig(db, actor, saved.value.versionId, signal)
  if (!published.ok) return err(published.error === 'forbidden' ? 'forbidden' : 'invalid_days')
  return ok({ version: published.value.version })
}
