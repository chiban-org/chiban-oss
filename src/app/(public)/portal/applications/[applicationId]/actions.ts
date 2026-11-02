'use server'

import { eq } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { users } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { submitApplication } from '@/features/applications/submitApplication'
import { getVersion } from '@/features/config/store'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldError } from '@/features/forms/validateSubmission'
import { startOnlinePayment } from '@/features/payments/startPayment'
import { saveDraftValues } from '@/features/portal/drafts'
import { fieldErrorCopy, rawValuesFromForm } from '@/features/portal/formData'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { withPortalActor } from '@/server/portalAction'
import { isUuid } from '@/utils/uuid'

const MB = 1024 * 1024
const fail = (error: string): ActionResult => ({ ok: false, error })

async function formOf(
  db: Db,
  applicationId: string,
  signal: AbortSignal,
): Promise<FormBody | null> {
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  return (await getVersion(db, app.pins.form, signal))?.body as FormBody
}

function withFieldErrors(errors: FieldError[]): ActionResult {
  return {
    ok: false,
    error: 'Check the highlighted fields and try again.',
    fieldErrors: Object.fromEntries(errors.map((e) => [e.field, fieldErrorCopy(e.code)])),
  }
}

export async function saveDraftAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    if (!isUuid(applicationId)) return fail(errorCopy('invalid_input'))
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
    const applicationId = text(formData, 'applicationId')
    if (!isUuid(applicationId)) return fail(errorCopy('invalid_input'))
    if (text(formData, 'attest') !== 'true') {
      return fail('Check the box to confirm the information is true.')
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
    if (typeof done.error === 'object') return withFieldErrors(done.error.fieldErrors)
    return fail(errorCopy(done.error))
  })
}

export type IntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }
export type FinalizeResponse = { ok: true } | { ok: false; error: string }

const CANNOT_ADD = 'You cannot add files here.'

const INTENT_COPY = {
  forbidden: CANNOT_ADD,
  too_large: `That file is larger than ${Math.floor(env.MAX_UPLOAD_BYTES / MB)} MB.`,
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Upload a PDF, JPEG, or PNG file.',
  series_required: CANNOT_ADD,
  unknown_series: CANNOT_ADD,
  doc_kind_not_allowed: CANNOT_ADD,
} as const

const FINALIZE_COPY = {
  forbidden: 'You cannot add files here.',
  expired: 'The upload took too long. Choose the file and try again.',
  already_finalized: 'That upload was already completed.',
  not_uploaded: 'The file did not arrive. Try again.',
  size_mismatch: 'The file changed while it was sent. Try again.',
  type_mismatch: 'That file is not the kind of file it says it is.',
} as const

export async function createUploadIntentAction(formData: FormData): Promise<IntentResponse> {
  return await withPortalActor(
    formData,
    (error): IntentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const kind = text(formData, 'targetKind')
      const id = text(formData, 'targetId')
      if ((kind !== 'application' && kind !== 'project') || !isUuid(id)) {
        return { ok: false, error: errorCopy('invalid_input') }
      }
      const made = await createUploadIntent(
        db,
        getObjectStore(),
        actor,
        {
          target: { kind, id },
          title: text(formData, 'title'),
          filename: text(formData, 'filename'),
          contentType: text(formData, 'contentType'),
          sizeBytes: Number(text(formData, 'sizeBytes')),
        },
        signal,
      )
      return made.ok ? { ok: true, ...made.value } : { ok: false, error: INTENT_COPY[made.error] }
    },
  )
}

export async function finalizeUploadAction(formData: FormData): Promise<FinalizeResponse> {
  return await withPortalActor(
    formData,
    (error): FinalizeResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const intentId = text(formData, 'intentId')
      if (!isUuid(intentId)) return { ok: false, error: errorCopy('invalid_input') }
      const done = await finalizeUpload(db, getObjectStore(), actor, { intentId }, signal)
      return done.ok ? { ok: true } : { ok: false, error: FINALIZE_COPY[done.error] }
    },
  )
}

export type PaymentResponse = { ok: true; redirectUrl: string } | { ok: false; error: string }

const PAY_COPY = {
  not_found: 'You cannot pay for this application.',
  nothing_due: 'Nothing is due right now.',
  not_configured: 'Online payment is not set up yet. Ask the land use office.',
} as const

export async function startPaymentAction(formData: FormData): Promise<PaymentResponse> {
  return await withPortalActor(
    formData,
    (error): PaymentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const applicationId = text(formData, 'applicationId')
      if (!isUuid(applicationId)) return { ok: false, error: errorCopy('invalid_input') }
      const [user] = await db
        .select({ name: users.displayName, email: users.email })
        .from(users)
        .where(eq(users.id, actor.userId))
      const started = await startOnlinePayment(
        db,
        actor,
        {
          applicationIds: [applicationId],
          payerName: user?.name ?? 'Applicant',
          payerEmail: user?.email,
        },
        signal,
      )
      if (started.ok) return { ok: true, redirectUrl: started.value.redirectUrl }
      const known = typeof started.error === 'string' ? PAY_COPY[started.error] : undefined
      return { ok: false, error: known ?? 'The payment service had a problem. Try again later.' }
    },
  )
}
