'use server'

import { redirect } from 'next/navigation'
import { discardDraft } from '@/features/config/discard'
import { isSingletonKind } from '@/features/config/kinds'
import { newItemKey } from '@/features/config/newItemKey'
import { publishConfig, rollbackConfig } from '@/features/config/publish'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { listKeysOfKind } from '@/features/config/settingsViews'
import { skeletonBody } from '@/features/config/skeletons'
import { saveDraft } from '@/features/config/store'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { refusedDraft } from './draftRefusal'
import { DISCARD_FORM, DRAFT_FORM, ROLLBACK_FORM, START_DRAFT_FORM } from './forms'

export async function saveDraftAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DRAFT_FORM, async ({ db, actor, signal }, input) => {
    const saved = await saveDraft(db, actor, input, signal)
    return saved.ok ? { ok: true, message: 'Draft saved.' } : refusedDraft(saved.error)
  })
}

export async function discardDraftAction(formData: FormData): Promise<ActionResult> {
  const outcome: { emptied: string | null } = { emptied: null }
  const result = await runStaffForm(
    formData,
    DISCARD_FORM,
    async ({ db, actor, signal }, input) => {
      const discarded = await discardDraft(db, actor, input, signal)
      if (!discarded.ok) {
        return {
          ok: false,
          error:
            discarded.error === 'forbidden'
              ? errorCopy('forbidden')
              : 'There is no draft to discard.',
        }
      }
      if (discarded.value.remaining === 0 && !isSingletonKind(input.kind)) {
        outcome.emptied = input.kind
      }
      return { ok: true, message: 'Draft discarded.' }
    },
  )
  if (result.ok && outcome.emptied !== null) redirect(`/staff/settings/${outcome.emptied}`)
  return result
}

export async function publishAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DRAFT_FORM, async ({ db, actor, signal }, input) => {
    const saved = await saveDraft(db, actor, input, signal)
    if (!saved.ok) return refusedDraft(saved.error)
    const published = await publishConfig(db, actor, saved.value.versionId, signal)
    if (published.ok)
      return { ok: true, message: `Put version ${published.value.version} into use.` }
    return {
      ok: false,
      error: 'This version cannot be put into use yet.',
      fieldErrors: fieldErrorsFor(published.error),
    }
  })
}

export async function rollbackAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ROLLBACK_FORM, async ({ db, actor, signal }, input) => {
    const result = await rollbackConfig(db, actor, input, signal)
    if (result.ok) {
      return {
        ok: true,
        message: `Rolled back to version ${input.toVersion} as version ${result.value.version}.`,
      }
    }
    if (typeof result.error === 'string') return { ok: false, error: errorCopy(result.error) }
    return {
      ok: false,
      error: 'That version cannot be restored.',
      fieldErrors: fieldErrorsFor(result.error),
    }
  })
}

export async function startDraftAction(formData: FormData): Promise<ActionResult> {
  const outcome: { kind: string; key: string } = { kind: '', key: '' }
  const result = await runStaffForm(formData, START_DRAFT_FORM, async (ctx, input) => {
    const { db, actor, signal } = ctx
    const taken = new Set((await listKeysOfKind(db, input.kind, signal)).map((row) => row.key))
    let key: string
    if (input.kind === 'town_rule_setting') {
      if (input.key === null) return refuseField('key', 'Choose a rule.')
      key = input.key
      if (taken.has(key)) return { ok: true, message: 'This rule is already set.' }
    } else {
      const chosen = newItemKey(input.label ?? '', input.key ?? '', taken)
      if (!chosen.ok) return refuseField(chosen.field, chosen.message)
      key = chosen.key
    }
    const body = skeletonBody(input.kind, key, input.label ?? key)
    const saved = await saveDraft(db, actor, { kind: input.kind, key, body }, signal)
    if (!saved.ok) return refusedDraft(saved.error)
    outcome.kind = input.kind
    outcome.key = key
    return { ok: true, message: 'Draft created.' }
  })
  if (result.ok && outcome.kind !== '') {
    redirect(`/staff/settings/${outcome.kind}/${encodeURIComponent(outcome.key)}`)
  }
  return result
}
