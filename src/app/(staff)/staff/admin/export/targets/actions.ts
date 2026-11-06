'use server'

import { requestRunNow, saveTarget, setTargetActive } from '@/features/export/targets/manageTargets'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { SAVE_TARGET_FORM, TARGET_ACTIVE_FORM, TARGET_ID_FORM, targetInputOf } from './targetForm'

const COPY = {
  forbidden: errorCopy('forbidden'),
  invalid_input: errorCopy('invalid_input'),
  not_found: errorCopy('not_found'),
  not_active: 'Turn the target on before running it.',
} as const

const FOLDER_NOT_WRITABLE =
  'That folder cannot be written to. Choose an existing folder the Chiban service can write to.'
const TENANT_ID_MALFORMED =
  'The Microsoft 365 tenant ID must be a GUID such as 11111111-2222-3333-4444-555555555555 or a domain such as contoso.onmicrosoft.com.'

const EXPORT = { exempt: 'export' } as const

export async function saveTargetAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    SAVE_TARGET_FORM,
    async ({ db, actor, signal }, input) => {
      const saved = await saveTarget(db, actor, targetInputOf(input), signal)
      if (saved.ok) return { ok: true, message: 'Saved. Reload this page to see it in the list.' }
      if (saved.error === 'folder_not_writable') return refuseField('root', FOLDER_NOT_WRITABLE)
      if (saved.error === 'tenant_id_malformed') return refuseField('tenantId', TENANT_ID_MALFORMED)
      return { ok: false, error: COPY[saved.error] }
    },
    EXPORT,
  )
}

export async function setTargetActiveAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    TARGET_ACTIVE_FORM,
    async ({ db, actor, signal }, { id, active }) => {
      const done = await setTargetActive(db, actor, id, active, signal)
      if (!done.ok) return { ok: false, error: COPY[done.error] }
      return { ok: true, message: active ? 'Turned on.' : 'Turned off.' }
    },
    EXPORT,
  )
}

export async function runTargetNowAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    TARGET_ID_FORM,
    async ({ db, actor, signal }, { id }) => {
      const done = await requestRunNow(db, actor, id, signal)
      if (!done.ok) return { ok: false, error: COPY[done.error] }
      return { ok: true, message: 'Requested. The copy starts within a minute or two.' }
    },
    EXPORT,
  )
}
