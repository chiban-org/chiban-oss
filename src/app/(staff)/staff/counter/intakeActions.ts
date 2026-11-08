'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { IntakeSaveResult } from '@/components/counter/intake/intakeTypes'
import { sendCounterClaim } from '@/features/contractors/counterClaim'
import { mayUseCounter } from '@/features/counter/counterAccess'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import { type StartIntakeError, startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { discardCounterIntake } from '@/features/counter/intake/unfinished'
import { optionalEmail } from '@/features/input/optionalEmail'
import { checkbox, optionalText, recordId, requiredText } from '@/features/input/schemas'
import { getMailTransport } from '@/features/mail/transport'
import { type ActionResult, errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm, refuseField, runStaffForm } from '@/server/formInput'
import { saveIntakeValues } from './intakeSave'

const START_FORM = z.object({
  parcelId: recordId('a parcel'),
  applicationTypeKey: requiredText('an application type', { max: 64 }),
  name: optionalText('the applicant name'),
  email: optionalEmail('the applicant email'),
})

const APPLICATION_FORM = z.object({ applicationId: recordId('an application') })

const SUBMIT_FORM = APPLICATION_FORM.extend({ signedOnPaper: checkbox() })

const NAME_REQUIRED = 'Enter the applicant name.'

const START_COPY: Record<Exclude<StartIntakeError, 'name_required' | 'forbidden'>, string> = {
  retired_parcel: 'That parcel was retired and takes no new applications.',
  unknown_parcel: 'That parcel is not on file.',
  not_published: 'That application type is not in use.',
  config_inconsistent: 'That application type is not set up completely yet.',
}

const CLAIM_COPY = {
  forbidden: errorCopy('forbidden'),
  rate_limited: 'Too many claim links were sent for this application. Try again later.',
  send_failed: 'The email could not be sent. Try again.',
  no_party_email: 'The applicant has no email address on this application.',
} as const

export async function startIntakeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, START_FORM, async ({ db, actor, signal }, input) => {
    const started = await startCounterIntake(
      db,
      actor,
      {
        parcelId: input.parcelId,
        applicationTypeKey: input.applicationTypeKey,
        applicant: {
          name: input.name ?? '',
          ...(input.email === null ? {} : { email: input.email }),
        },
      },
      signal,
    )
    if (started.ok) redirect(intakeHref(started.value.applicationId))
    if (started.error === 'name_required') return refuseField('name', NAME_REQUIRED)
    if (started.error === 'forbidden') return { ok: false, error: errorCopy('forbidden') }
    return { ok: false, error: START_COPY[started.error] }
  })
}

export async function saveIntakeAction(formData: FormData): Promise<IntakeSaveResult> {
  return await runStaffValue(
    formData,
    (error): IntakeSaveResult => ({ ok: false, error }),
    async (ctx) => {
      const parsed = parseForm(APPLICATION_FORM, formData)
      if (!parsed.ok) return parsed.error
      if (!(await mayUseCounter(ctx.db, ctx.actor, ctx.signal))) {
        return { ok: false, error: errorCopy('forbidden') }
      }
      return await saveIntakeValues(ctx, { applicationId: parsed.value.applicationId, formData })
    },
  )
}

function fieldList(fields: readonly { field: string }[]): string {
  return fields.map((f) => f.field.replaceAll('_', ' ')).join(', ')
}

export async function submitIntakeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SUBMIT_FORM, async ({ db, actor, signal }, input) => {
    const done = await submitCounterIntake(
      db,
      actor,
      { applicationId: input.applicationId, signedOnPaper: input.signedOnPaper },
      signal,
    )
    if (done.ok) redirect(intakeHref(input.applicationId))
    if (done.error === 'paper_attestation_required') {
      return refuseField('signedOnPaper', 'Confirm the applicant signed the attestation on paper.')
    }
    if (typeof done.error === 'object') {
      return {
        ok: false,
        error: `Some answers are missing or not valid: ${fieldList(done.error.fieldErrors)}. Go back to the application form to fix them.`,
      }
    }
    return { ok: false, error: errorCopy(done.error) }
  })
}

export async function discardIntakeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, APPLICATION_FORM, async ({ db, actor, signal }, input) => {
    const done = await discardCounterIntake(db, actor, input, signal)
    if (done.ok) return { ok: true, message: 'Discarded the unfinished application.' }
    return {
      ok: false,
      error:
        done.error === 'forbidden'
          ? errorCopy('forbidden')
          : 'This application is no longer unfinished.',
    }
  })
}

export async function sendApplicantClaimAction(
  formData: FormData,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const fail = (error: string) => ({ ok: false as const, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(APPLICATION_FORM, formData)
    if (!parsed.ok) return fail(parsed.error.error)
    const sent = await sendCounterClaim(
      db,
      getMailTransport(),
      actor,
      { applicationId: parsed.value.applicationId, role: 'applicant' },
      signal,
    )
    if (sent.ok) return { ok: true as const, message: 'Claim link sent to the applicant.' }
    return fail(CLAIM_COPY[sent.error])
  })
}
