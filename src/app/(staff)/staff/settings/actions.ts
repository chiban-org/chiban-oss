'use server'

import { redirect } from 'next/navigation'
import { adoptStarter } from '@/features/config/adoptStarter'
import { type ConfigKind, isConfigKind } from '@/features/config/kinds'
import { publishConfig, rollbackConfig } from '@/features/config/publish'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { skeletonBody } from '@/features/config/skeletons'
import { saveDraft } from '@/features/config/store'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

function parseBody(formData: FormData): unknown {
  try {
    return JSON.parse(text(formData, 'body')) as unknown
  } catch {
    return undefined
  }
}

function kindOf(formData: FormData): ConfigKind | null {
  const kind = text(formData, 'kind')
  return isConfigKind(kind) ? kind : null
}

const INVALID: ActionResult = { ok: false, error: errorCopy('invalid_input') }

export async function saveDraftAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = kindOf(formData)
    const body = parseBody(formData)
    if (kind === null || body === undefined) return INVALID
    const saved = await saveDraft(db, actor, { kind, key: text(formData, 'key'), body }, signal)
    if (saved.ok) return { ok: true, message: 'Draft saved.' }
    if (saved.error === 'forbidden') {
      return { ok: false, error: errorCopy('forbidden'), fieldErrors: fieldErrorsFor('forbidden') }
    }
    return { ok: false, error: 'The draft has errors.', fieldErrors: fieldErrorsFor(saved.error) }
  })
}

export async function publishAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = kindOf(formData)
    const body = parseBody(formData)
    if (kind === null || body === undefined) return INVALID
    const saved = await saveDraft(db, actor, { kind, key: text(formData, 'key'), body }, signal)
    if (!saved.ok) {
      const errors = fieldErrorsFor(saved.error === 'forbidden' ? 'forbidden' : saved.error)
      return { ok: false, error: 'The draft has errors.', fieldErrors: errors }
    }
    const published = await publishConfig(db, actor, saved.value.versionId, signal)
    if (published.ok) return { ok: true, message: `Published version ${published.value.version}.` }
    return {
      ok: false,
      error: 'This version cannot be published yet.',
      fieldErrors: fieldErrorsFor(published.error),
    }
  })
}

export async function rollbackAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = kindOf(formData)
    const toVersion = Number(text(formData, 'toVersion'))
    if (kind === null || !Number.isInteger(toVersion)) return INVALID
    const result = await rollbackConfig(
      db,
      actor,
      { kind, key: text(formData, 'key'), toVersion },
      signal,
    )
    if (result.ok) {
      return {
        ok: true,
        message: `Rolled back to version ${toVersion} as version ${result.value.version}.`,
      }
    }
    if (result.error === 'no_such_version') return { ok: false, error: errorCopy(result.error) }
    return {
      ok: false,
      error: 'That version cannot be restored.',
      fieldErrors: fieldErrorsFor(result.error),
    }
  })
}

export async function adoptStarterAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await adoptStarter(db, actor, text(formData, 'starterId'), signal)
    if (result.ok)
      return { ok: true, message: `Adopted ${result.value.versionIds.length} configuration items.` }
    if (typeof result.error === 'string') return { ok: false, error: errorCopy(result.error) }
    return {
      ok: false,
      error: 'The starter did not pass the publish checks.',
      fieldErrors: fieldErrorsFor(result.error),
    }
  })
}

export async function startDraftAction(formData: FormData): Promise<ActionResult> {
  const kind = kindOf(formData)
  const key = text(formData, 'key')
  const result = await runStaffAction(formData, async ({ db, actor, signal }) => {
    if (kind === null || key === '') return INVALID
    const saved = await saveDraft(db, actor, { kind, key, body: skeletonBody(kind, key) }, signal)
    if (saved.ok) return { ok: true, message: 'Draft created.' }
    return {
      ok: false,
      error: saved.error === 'forbidden' ? errorCopy('forbidden') : errorCopy('invalid_input'),
    }
  })
  if (result.ok && kind !== null) redirect(`/staff/settings/${kind}/${encodeURIComponent(key)}`)
  return result
}
