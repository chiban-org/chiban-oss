'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import type {
  CounterClaimResult,
  CounterLinks,
  CounterOutcome,
  ReaderStatus,
} from '@/components/counter/counterTypes'
import { db } from '@/db/client'
import { applications, receipts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { sendCounterClaim } from '@/features/contractors/counterClaim'
import { parseQuickIssue } from '@/features/counter/parseQuickIssue'
import {
  completeQuickIssue,
  type QuickIssueError,
  type QuickIssueResult,
  quickIssue,
} from '@/features/counter/quickIssue'
import { getMailTransport } from '@/features/mail/transport'
import {
  checkWithProcessor,
  reconnectSimulatedReader,
  resolveSimulatedReader,
} from '@/features/payments/startPayment'
import { guardAction } from '@/server/actionGuard'
import { errorCopy, text } from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

const ACTION_TIMEOUT_MS = 30_000
const READER_OUTCOMES = ['captured', 'declined', 'unknown'] as const

interface Ctx {
  actor: Actor
  signal: AbortSignal
}

async function guarded<T extends { ok: boolean }>(
  formData: FormData,
  fail: (error: string) => T,
  fn: (ctx: Ctx) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return fail(errorCopy(guard.error))
  if (guard.value?.kind !== 'staff') return fail(errorCopy('signed_out'))
  return await fn({ actor: guard.value, signal })
}

const CLAIM_COPY = {
  forbidden: errorCopy('forbidden'),
  rate_limited: 'Too many claim links were sent for this project. Try again later.',
  send_failed: 'The email could not be sent. Try again.',
  no_contractor_email: 'The contractor has no email address on this permit.',
} as const

const failOutcome = (error: string): CounterOutcome => ({ ok: false, error })
const failReader = (error: string): ReaderStatus => ({ ok: false, error })

function copyFor(error: QuickIssueError | 'not_simulated'): string {
  if (typeof error === 'string') {
    return error === 'not_simulated' ? 'This reader is not simulated.' : errorCopy(error)
  }
  if ('fieldErrors' in error) {
    return `Check these fields: ${error.fieldErrors.map((f) => f.field.replaceAll('_', ' ')).join(', ')}.`
  }
  if ('gateBlocked' in error) {
    const reasons = error.gateBlocked
      .filter((g) => g.effective === 'blocked' && g.outcome.status !== 'pass')
      .map((g) => (g.outcome.status === 'pass' ? '' : g.outcome.reason))
    return `Not issued. ${reasons.join(' ')}`
  }
  return `The card processor reported a problem: ${error.detail}`
}

async function linksFor(result: QuickIssueResult): Promise<CounterLinks | null> {
  if (result.state !== 'issued') return null
  const base = `/staff/applications/${result.applicationId}`
  const [receipt] =
    result.receiptNumber === null
      ? []
      : await db
          .select({ id: receipts.id })
          .from(receipts)
          .where(eq(receipts.number, result.receiptNumber))
  return {
    permit: `${base}/permit.pdf`,
    placard: `${base}/placard.pdf`,
    receipt: receipt === undefined ? null : `/staff/receipts/${receipt.id}`,
  }
}

async function outcomeOf(result: QuickIssueResult): Promise<CounterOutcome> {
  revalidatePath('/staff', 'layout')
  return {
    ok: true,
    state: result.state,
    number: result.number,
    applicationId: result.applicationId,
    attemptId: result.attemptId,
    links: await linksFor(result),
  }
}

export async function quickIssueAction(formData: FormData): Promise<CounterOutcome> {
  return await guarded(formData, failOutcome, async ({ actor, signal }) => {
    const parsed = parseQuickIssue(formData)
    if (!parsed.ok) return failOutcome(errorCopy('invalid_input'))
    const result = await quickIssue(db, actor, parsed.value, signal)
    return result.ok ? await outcomeOf(result.value) : failOutcome(copyFor(result.error))
  })
}

export async function completeAction(formData: FormData): Promise<CounterOutcome> {
  return await guarded(formData, failOutcome, async ({ actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    if (!isUuid(applicationId)) return failOutcome(errorCopy('invalid_input'))
    const [row] = await db.select().from(applications).where(eq(applications.id, applicationId))
    const result = await completeQuickIssue(
      db,
      actor,
      { applicationId, expectedRowVersion: row?.rowVersion ?? 0 },
      signal,
    )
    return result.ok ? await outcomeOf(result.value) : failOutcome(copyFor(result.error))
  })
}

export async function sendClaimAction(formData: FormData): Promise<CounterClaimResult> {
  const fail = (error: string): CounterClaimResult => ({ ok: false, error })
  return await guarded(formData, fail, async ({ actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    if (!isUuid(applicationId)) return fail(errorCopy('invalid_input'))
    const sent = await sendCounterClaim(db, getMailTransport(), actor, { applicationId }, signal)
    if (sent.ok) return { ok: true, message: 'Claim link sent to the contractor.' }
    return fail(CLAIM_COPY[sent.error])
  })
}

export async function readerAction(formData: FormData): Promise<ReaderStatus> {
  return await guarded(formData, failReader, async ({ actor, signal }) => {
    const attemptId = text(formData, 'attemptId')
    const outcome = READER_OUTCOMES.find((o) => o === text(formData, 'outcome'))
    if (!isUuid(attemptId) || outcome === undefined) return failReader(errorCopy('invalid_input'))
    const result = await resolveSimulatedReader(db, actor, { attemptId, outcome }, signal)
    return result.ok
      ? { ok: true, state: result.value.state, outcomeUnknown: result.value.outcomeUnknown }
      : failReader(copyFor(result.error))
  })
}

export async function checkAction(formData: FormData): Promise<ReaderStatus> {
  return await guarded(formData, failReader, async ({ actor, signal }) => {
    const attemptId = text(formData, 'attemptId')
    if (!isUuid(attemptId)) return failReader(errorCopy('invalid_input'))
    const result = await checkWithProcessor(db, actor, attemptId, signal)
    return result.ok
      ? { ok: true, state: result.value.state, outcomeUnknown: result.value.outcomeUnknown }
      : failReader(copyFor(result.error))
  })
}

export async function reconnectAction(formData: FormData): Promise<ReaderStatus> {
  return await guarded(formData, failReader, async ({ actor, signal }) => {
    const attemptId = text(formData, 'attemptId')
    const outcome = text(formData, 'outcome')
    if (!isUuid(attemptId) || (outcome !== 'captured' && outcome !== 'declined')) {
      return failReader(errorCopy('invalid_input'))
    }
    const result = await reconnectSimulatedReader(db, actor, { attemptId, outcome }, signal)
    return result.ok
      ? { ok: true, state: 'pending', outcomeUnknown: true }
      : failReader(copyFor(result.error))
  })
}
