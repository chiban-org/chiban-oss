'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type {
  CounterClaimResult,
  CounterLinks,
  CounterOutcome,
  FieldErrors,
} from '@/components/counter/counterTypes'
import { db } from '@/db/client'
import { applications, receipts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { sendCounterClaim } from '@/features/contractors/counterClaim'
import {
  blockedOnFilingDocuments,
  takeQuickIssueForReview,
} from '@/features/counter/intake/fromQuickIssue'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import { parseQuickIssue } from '@/features/counter/parseQuickIssue'
import {
  completeQuickIssue,
  type QuickIssueError,
  type QuickIssueInput,
  type QuickIssueResult,
  quickIssue,
} from '@/features/counter/quickIssue'
import { recordId } from '@/features/input/schemas'
import { getMailTransport } from '@/features/mail/transport'
import { fieldErrorCopy } from '@/features/portal/formData'
import { errorCopy } from '@/server/actionRunner'
import { copyFor, failOutcome, guarded, guardedForm } from './counterGuard'

const CLAIM_COPY = {
  forbidden: errorCopy('forbidden'),
  rate_limited: 'Too many claim links were sent for this project. Try again later.',
  send_failed: 'The email could not be sent. Try again.',
  no_party_email: 'The contractor has no email address on this permit.',
  already_linked: 'The contractor already has an account. This permit is on their dashboard.',
} as const

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

const COMPLETE_FORM = z.object({ applicationId: recordId('an application') })

const FIELD_OF_ERROR: Record<string, string> = {
  license_required: 'licenseNumber',
  check_number_required: 'checkNumber',
  tendered_short: 'tendered',
}

function refusalFields(error: QuickIssueError): FieldErrors | undefined {
  if (typeof error === 'string') {
    const field = FIELD_OF_ERROR[error]
    return field === undefined ? undefined : { [field]: errorCopy(error) }
  }
  if ('fieldErrors' in error) {
    return Object.fromEntries(
      error.fieldErrors.map((f) => [`value.${f.field}`, fieldErrorCopy(f.code)]),
    )
  }
  return undefined
}

async function routeToReview(
  ctx: { actor: Actor; signal: AbortSignal },
  input: QuickIssueInput,
  refusal: string,
): Promise<CounterOutcome> {
  const taken = await takeQuickIssueForReview(db, ctx.actor, input, ctx.signal)
  if (!taken.ok) return failOutcome(refusal)
  revalidatePath('/staff', 'layout')
  return {
    ok: false,
    error: `${refusal} It was taken for review instead, with the answers entered.`,
    reviewHref: `${intakeHref(taken.value.applicationId, 'documents')}&from=quick_issue`,
  }
}

export async function quickIssueAction(formData: FormData): Promise<CounterOutcome> {
  return await guarded(formData, failOutcome, async ({ actor, signal }) => {
    const parsed = parseQuickIssue(formData)
    if (!parsed.ok) return failOutcome(parsed.error.error, parsed.error.fieldErrors)
    const result = await quickIssue(db, actor, parsed.value, signal)
    if (result.ok) return await outcomeOf(result.value)
    if (blockedOnFilingDocuments(result.error)) {
      return await routeToReview({ actor, signal }, parsed.value, copyFor(result.error))
    }
    return failOutcome(copyFor(result.error), refusalFields(result.error))
  })
}

export async function completeAction(formData: FormData): Promise<CounterOutcome> {
  return await guardedForm(
    formData,
    COMPLETE_FORM,
    failOutcome,
    async ({ actor, signal }, input) => {
      const { applicationId } = input
      const [row] = await db.select().from(applications).where(eq(applications.id, applicationId))
      const result = await completeQuickIssue(
        db,
        actor,
        { applicationId, expectedRowVersion: row?.rowVersion ?? 0 },
        signal,
      )
      return result.ok ? await outcomeOf(result.value) : failOutcome(copyFor(result.error))
    },
  )
}

export async function sendClaimAction(formData: FormData): Promise<CounterClaimResult> {
  const fail = (error: string): CounterClaimResult => ({ ok: false, error })
  return await guardedForm(formData, COMPLETE_FORM, fail, async ({ actor, signal }, input) => {
    const sent = await sendCounterClaim(db, getMailTransport(), actor, input, signal)
    if (sent.ok) return { ok: true, message: 'Claim link sent to the contractor.' }
    return fail(CLAIM_COPY[sent.error])
  })
}
