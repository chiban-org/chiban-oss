'use server'

import { requestRunNow, saveTarget, setTargetActive } from '@/features/export/targets/manageTargets'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { parseTargetForm } from './targetForm'

const COPY = {
  forbidden: errorCopy('forbidden'),
  invalid_input: errorCopy('invalid_input'),
  not_found: errorCopy('not_found'),
  folder_not_writable:
    'That folder cannot be written to. Choose an existing folder the Chiban service can write to.',
  tenant_id_malformed:
    'The Microsoft 365 tenant ID must be a GUID such as 11111111-2222-3333-4444-555555555555 or a domain such as contoso.onmicrosoft.com.',
  not_active: 'Turn the target on before running it.',
} as const

export async function saveTargetAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(
    formData,
    async ({ db, actor, signal }) => {
      const input = parseTargetForm(formData)
      if (input === null) return { ok: false, error: COPY.invalid_input }
      const saved = await saveTarget(db, actor, input, signal)
      if (!saved.ok) return { ok: false, error: COPY[saved.error] }
      return { ok: true, message: 'Saved. Reload this page to see it in the list.' }
    },
    { exempt: 'export' },
  )
}

export async function setTargetActiveAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(
    formData,
    async ({ db, actor, signal }) => {
      const active = text(formData, 'active') === 'true'
      const done = await setTargetActive(db, actor, text(formData, 'id'), active, signal)
      if (!done.ok) return { ok: false, error: COPY[done.error] }
      return { ok: true, message: active ? 'Turned on.' : 'Turned off.' }
    },
    { exempt: 'export' },
  )
}

export async function runTargetNowAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(
    formData,
    async ({ db, actor, signal }) => {
      const done = await requestRunNow(db, actor, text(formData, 'id'), signal)
      if (!done.ok) return { ok: false, error: COPY[done.error] }
      return { ok: true, message: 'Requested. The copy starts within a minute or two.' }
    },
    { exempt: 'export' },
  )
}
