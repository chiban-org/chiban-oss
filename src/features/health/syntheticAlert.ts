import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db, DbOrTx } from '@/db/client'
import { alertTests } from '@/db/schema'
import { getTownSettings } from '@/features/town/settings'
import { err, ok, type Result } from '@/types/result'
import type { AlertChannel, AlertChannelKind } from './channels/types'

const TOKEN_BYTES = 32
const READY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const FALLBACK_TOWN_NAME = 'Chiban'
const TRAILING_SLASH = /\/$/

export type ReadinessStatus = 'acknowledged' | 'sent_unacknowledged' | 'never_tested'

export interface ReadinessRow {
  channel: AlertChannelKind
  status: ReadinessStatus
  lastSentAt: Date | null
  lastAcknowledgedAt: Date | null
}

export interface SyntheticResult {
  channel: AlertChannelKind
  testId: string
  sent: boolean
}

export interface SyntheticOptions {
  now: Date
  createdByKind: string
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function sendSyntheticAlert(
  db: Db,
  channels: AlertChannel[],
  signal: AbortSignal,
  options: SyntheticOptions,
): Promise<SyntheticResult[]> {
  const town = await getTownSettings(db, signal)
  const townName = town.ok ? town.value.name : FALLBACK_TOWN_NAME
  const results: SyntheticResult[] = []
  for (const channel of channels) {
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    const testId = randomUUID()
    await db.insert(alertTests).values({
      id: testId,
      channel: channel.kind,
      tokenHash: hashToken(token),
      sentAt: options.now,
      createdByKind: options.createdByKind,
    })
    const sent = await channel.send(
      {
        key: `synthetic:${testId}`,
        kind: 'synthetic',
        severity: 'warning',
        state: 'test',
        summary: 'Test alert: confirm this reached you',
        townName,
        ackUrl: `${env.BASE_URL.replace(TRAILING_SLASH, '')}/alerts/ack/${token}`,
      },
      signal,
    )
    if (!sent.ok) await db.delete(alertTests).where(eq(alertTests.id, testId))
    results.push({ channel: channel.kind, testId, sent: sent.ok })
  }
  return results
}

export async function findAlertTest(
  db: DbOrTx,
  token: string,
  signal: AbortSignal,
): Promise<{ acknowledgedAt: Date | null } | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ acknowledgedAt: alertTests.acknowledgedAt })
    .from(alertTests)
    .where(eq(alertTests.tokenHash, hashToken(token)))
  return row ?? null
}

export async function acknowledgeAlert(
  db: DbOrTx,
  token: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<void, 'invalid'>> {
  const found = await findAlertTest(db, token, signal)
  if (found === null) return err('invalid')
  await db
    .update(alertTests)
    .set({ acknowledgedAt: now })
    .where(and(eq(alertTests.tokenHash, hashToken(token)), isNull(alertTests.acknowledgedAt)))
  return ok(undefined)
}

function statusOf(lastSent: Date | null, recentAck: Date | null): ReadinessStatus {
  if (recentAck !== null) return 'acknowledged'
  return lastSent === null ? 'never_tested' : 'sent_unacknowledged'
}

export async function alertReadiness(
  db: DbOrTx,
  channels: AlertChannelKind[],
  now: Date,
  signal: AbortSignal,
): Promise<ReadinessRow[]> {
  signal.throwIfAborted()
  const rows: ReadinessRow[] = []
  for (const channel of channels) {
    const [lastSent] = await db
      .select({ sentAt: alertTests.sentAt })
      .from(alertTests)
      .where(eq(alertTests.channel, channel))
      .orderBy(desc(alertTests.sentAt))
      .limit(1)
    const [recentAck] = await db
      .select({ acknowledgedAt: alertTests.acknowledgedAt })
      .from(alertTests)
      .where(
        and(
          eq(alertTests.channel, channel),
          isNotNull(alertTests.acknowledgedAt),
          gt(alertTests.acknowledgedAt, new Date(now.getTime() - READY_WINDOW_MS)),
        ),
      )
      .orderBy(desc(alertTests.acknowledgedAt))
      .limit(1)
    rows.push({
      channel,
      status: statusOf(lastSent?.sentAt ?? null, recentAck?.acknowledgedAt ?? null),
      lastSentAt: lastSent?.sentAt ?? null,
      lastAcknowledgedAt: recentAck?.acknowledgedAt ?? null,
    })
  }
  return rows
}
