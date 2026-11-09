'use server'

import { z } from 'zod'
import type { Db } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import { submitApplication } from '@/features/applications/submitApplication'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import { type FieldError, validateSubmission } from '@/features/forms/validateSubmission'
import type { GateResult } from '@/features/gates/evaluateGates'
import { recordId } from '@/features/input/schemas'
import { saveDraftValues } from '@/features/portal/drafts'
import { fieldErrorCopy, rawValuesFromForm } from '@/features/portal/formData'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

const fail = (error: string): ActionResult => ({ ok: false, error })

async function draftOf(
  db: Db,
  applicationId: string,
  signal: AbortSignal,
): Promise<{ form: FormBody; projectId: string } | null> {
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  const form = (await getVersion(db, app.pins.form, signal))?.body as FormBody | undefined
  return form === undefined ? null : { form, projectId: app.projectId }
}

async function formOf(
  db: Db,
  applicationId: string,
  signal: AbortSignal,
): Promise<FormBody | null> {
  return (await draftOf(db, applicationId, signal))?.form ?? null
}

const CHECK_FIELDS = 'Check the highlighted fields and try again.'
const ATTEST_COPY = 'Check the box to confirm the information is true.'

function withFieldErrors(errors: FieldError[], extra: Record<string, string> = {}): ActionResult {
  return {
    ok: false,
    error: CHECK_FIELDS,
    fieldErrors: {
      ...Object.fromEntries(errors.map((e) => [e.field, fieldErrorCopy(e.code)])),
      ...extra,
    },
  }
}

async function unattestedRefusal(
  db: Db,
  actor: Actor,
  applicationId: string,
  formData: FormData,
  signal: AbortSignal,
): Promise<ActionResult> {
  const draft = await draftOf(db, applicationId, signal)
  if (draft === null) return fail(errorCopy('not_found'))
  const mayEdit =
    hasFullRecordAccess(actor) || (await isActiveParty(db, actor.userId, draft.projectId))
  if (!mayEdit) return fail(errorCopy('forbidden'))
  const checked = validateSubmission(draft.form, rawValuesFromForm(formData, draft.form), {
    asStaff: false,
  })
  return withFieldErrors(checked.ok ? [] : checked.error, { attest: ATTEST_COPY })
}

function blockedCopy(results: GateResult[]): string {
  const reasons = results.flatMap((g) =>
    g.effective === 'blocked' && g.outcome.status !== 'pass' ? [g.outcome.reason] : [],
  )
  return `Not submitted. ${reasons.join(' ')}`
}

const SaveForm = z.object({ applicationId: recordId('an application') })

export async function saveDraftAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(SaveForm, formData)
    if (!parsed.ok) return parsed.error
    const { applicationId } = parsed.value
    const form = await formOf(db, applicationId, signal)
    if (form === null) return fail(errorCopy('not_found'))
    const saved = await saveDraftValues(
      db,
      actor,
      { applicationId, values: rawValuesFromForm(formData, form) },
      signal,
    )
    if (saved.ok) return { ok: true, message: 'Draft saved.' }
    if (saved.error === 'not_found') return fail(errorCopy('not_found'))
    if (saved.error === 'not_draft') return fail('This application was already submitted.')
    return withFieldErrors(saved.error.fieldErrors)
  })
}

export async function submitApplicationAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(SaveForm, formData)
    if (!parsed.ok) return parsed.error
    const { applicationId } = parsed.value
    if (formData.get('attest') !== 'true') {
      return await unattestedRefusal(db, actor, applicationId, formData, signal)
    }
    const form = await formOf(db, applicationId, signal)
    if (form === null) return fail(errorCopy('not_found'))
    const done = await submitApplication(
      db,
      actor,
      {
        applicationId,
        values: rawValuesFromForm(formData, form),
        attestation: { statementSha256: text(formData, 'attestationSha256') },
      },
      signal,
    )
    if (done.ok) return { ok: true, message: 'Application submitted.' }
    if (typeof done.error === 'string') return fail(errorCopy(done.error))
    if ('gateBlocked' in done.error) return fail(blockedCopy(done.error.gateBlocked))
    return withFieldErrors(done.error.fieldErrors)
  })
}
