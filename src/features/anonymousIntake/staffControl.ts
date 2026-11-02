import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { anonymousIntakeProbeTokens, anonymousIntakeVerifications, townSettings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { verifiedFor } from '@/features/anonymousIntake/enablement'
import { hashProbeToken } from '@/features/anonymousIntake/probeToken'
import type { ProbeFinding } from '@/features/anonymousIntake/retentionProbe'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

const PROBE_TOKEN_MINUTES = 10
const MS_PER_MINUTE = 60_000
const TOKEN_BYTES = 24

export interface RunningBuild {
  imageRef: string | null
  appVersion: string
}

export const runningBuild = (): RunningBuild => ({
  imageRef: env.CHIBAN_IMAGE_REF ?? null,
  appVersion: APP_VERSION,
})

export async function recordVerification(
  db: Db,
  input: {
    imageRef: string | null
    appVersion: string
    caddyfileSha256: string
    passed: boolean
    findings: ProbeFinding[]
  },
): Promise<{ verificationId: string }> {
  const [row] = await db
    .insert(anonymousIntakeVerifications)
    .values({
      imageRef: input.imageRef,
      appVersion: input.appVersion,
      caddyfileSha256: input.caddyfileSha256,
      passed: input.passed,
      findings: input.findings,
    })
    .returning({ id: anonymousIntakeVerifications.id })
  return { verificationId: row?.id ?? '' }
}

export async function issueProbeToken(db: Db, now: Date = new Date()): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  await db.insert(anonymousIntakeProbeTokens).values({
    tokenHash: hashProbeToken(token),
    expiresAt: new Date(now.getTime() + PROBE_TOKEN_MINUTES * MS_PER_MINUTE),
  })
  return token
}

export async function enableAnonymousIntake(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  running: RunningBuild = runningBuild(),
): Promise<Result<void, 'forbidden' | 'verification_required'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'anonymous_intake.enable', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    if (!(await verifiedFor(tx, running.imageRef, running.appVersion))) {
      return err('verification_required')
    }
    await tx
      .update(townSettings)
      .set({ anonymousIntakeEnabled: true })
      .where(eq(townSettings.id, 1))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'anonymous_intake.enabled',
        entityType: 'town_settings',
        entityId: '1',
        after: { imageRef: running.imageRef, appVersion: running.appVersion },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function disableAnonymousIntake(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'anonymous_intake.enable', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    await tx
      .update(townSettings)
      .set({ anonymousIntakeEnabled: false })
      .where(eq(townSettings.id, 1))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'anonymous_intake.disabled',
        entityType: 'town_settings',
        entityId: '1',
      },
      signal,
    )
    return ok(undefined)
  })
}
