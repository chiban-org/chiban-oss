'use server'

import { redirect } from 'next/navigation'
import type { PreviewActionResult } from '@/components/config/WorkflowEditor'
import { adoptStarter } from '@/features/config/adoptStarter'
import { applyStarterPaths } from '@/features/config/applyStarterPaths'
import { type ConfigIssue, type ConfigKind, isConfigKind } from '@/features/config/kinds'
import { newItemKey } from '@/features/config/newItemKey'
import { publishConfig, rollbackConfig } from '@/features/config/publish'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { listKeysOfKind } from '@/features/config/settingsViews'
import { skeletonBody } from '@/features/config/skeletons'
import { saveDraft } from '@/features/config/store'
import { previewWorkflow } from '@/features/workflow/previewWorkflow'
import {
  type ActionResult,
  errorCopy,
  runStaffAction,
  runStaffValue,
  text,
} from '@/server/actionRunner'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'

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

function refusedDraft(error: 'forbidden' | { invalid: ConfigIssue[] }): ActionResult {
  const fieldErrors = fieldErrorsFor(error)
  if (error === 'forbidden') return { ok: false, error: errorCopy('forbidden'), fieldErrors }
  return { ok: false, error: 'The draft has errors.', fieldErrors }
}

export async function saveDraftAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = kindOf(formData)
    const body = parseBody(formData)
    if (kind === null || body === undefined) return INVALID
    const saved = await saveDraft(db, actor, { kind, key: text(formData, 'key'), body }, signal)
    if (saved.ok) return { ok: true, message: 'Draft saved.' }
    return refusedDraft(saved.error)
  })
}

export async function publishAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = kindOf(formData)
    const body = parseBody(formData)
    if (kind === null || body === undefined) return INVALID
    const saved = await saveDraft(db, actor, { kind, key: text(formData, 'key'), body }, signal)
    if (!saved.ok) return refusedDraft(saved.error)
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
  let key = ''
  const result = await runStaffAction(formData, async ({ db, actor, signal }) => {
    if (kind === null) return INVALID
    const taken = new Set((await listKeysOfKind(db, kind, signal)).map((row) => row.key))
    if (kind === 'town_rule_setting') {
      key = text(formData, 'key')
      if (key === '') return INVALID
      if (taken.has(key)) return { ok: true, message: 'This rule is already set.' }
    } else {
      const chosen = newItemKey(text(formData, 'label'), text(formData, 'key'), taken)
      if (!chosen.ok) {
        return { ok: false, error: chosen.message, fieldErrors: { [chosen.field]: chosen.message } }
      }
      key = chosen.key
    }
    const label = text(formData, 'label').trim() || key
    const body = skeletonBody(kind, key, label)
    const saved = await saveDraft(db, actor, { kind, key, body }, signal)
    if (saved.ok) return { ok: true, message: 'Draft created.' }
    return refusedDraft(saved.error)
  })
  if (result.ok && kind !== null) redirect(`/staff/settings/${kind}/${encodeURIComponent(key)}`)
  return result
}

const PATH_FIELD = 'path:'

function selectedPaths(
  formData: FormData,
): Map<string, { kind: ConfigKind; key: string; paths: string[] }> {
  const grouped = new Map<string, { kind: ConfigKind; key: string; paths: string[] }>()
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith(PATH_FIELD) || typeof value !== 'string') continue
    const [kind = '', key = ''] = name.slice(PATH_FIELD.length).split(':')
    if (!isConfigKind(kind)) continue
    const held = grouped.get(name) ?? { kind, key, paths: [] }
    held.paths.push(value)
    grouped.set(name, held)
  }
  return grouped
}

export async function applyStarterPathsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const selections = [...selectedPaths(formData).values()]
    if (selections.length === 0) return { ok: false, error: 'Select at least one change to apply.' }
    for (const selection of selections) {
      const result = await applyStarterPaths(db, actor, selection, signal)
      if (result.ok) continue
      if (typeof result.error === 'string') return { ok: false, error: errorCopy(result.error) }
      return {
        ok: false,
        error: `The change to ${selection.key} did not pass the publish checks.`,
        fieldErrors: fieldErrorsFor(result.error),
      }
    }
    return { ok: true, message: `Applied changes to ${selections.length} configuration items.` }
  })
}

function previewFailure(result: ActionResult): PreviewActionResult {
  return result.ok ? { ok: false, error: errorCopy('invalid_input') } : result
}

function sampleDate(formData: FormData, name: string): CivilDate | undefined {
  const parsed = parseCivilDate(text(formData, name))
  return parsed.ok ? parsed.value : undefined
}

export async function previewWorkflowAction(formData: FormData): Promise<PreviewActionResult> {
  return await runStaffValue<PreviewActionResult>(
    formData,
    (error) => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const body = parseBody(formData)
      const received = sampleDate(formData, 'previewReceived')
      if (body === undefined || received === undefined) return previewFailure(INVALID)
      const saved = await saveDraft(
        db,
        actor,
        { kind: 'application_type', key: text(formData, 'key'), body },
        signal,
      )
      if (!saved.ok) return previewFailure(refusedDraft(saved.error))
      const accepted = sampleDate(formData, 'previewAccepted')
      const meeting = sampleDate(formData, 'previewMeeting')
      const shown = await previewWorkflow(
        db,
        actor,
        {
          versionId: saved.value.versionId,
          sampleFacts: {
            classification: null,
            dwellingUnits: null,
            afterTheFact: false,
            regionalImpact: text(formData, 'previewRegionalImpact') !== '',
          },
          sampleDates: {
            received,
            ...(accepted === undefined ? {} : { accepted }),
            ...(meeting === undefined ? {} : { meeting }),
          },
        },
        signal,
      )
      if (!shown.ok) return { ok: false, error: errorCopy(shown.error) }
      return { ok: true, message: 'Preview updated. Nothing was published.', preview: shown.value }
    },
  )
}
