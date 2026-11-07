'use server'

import { adoptStarter } from '@/features/config/adoptStarter'
import { applyStarterPaths } from '@/features/config/applyStarterPaths'
import { type ConfigKind, isConfigKind } from '@/features/config/kinds'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { ADOPT_STARTER_FORM, NO_FIELDS } from './forms'

export async function adoptStarterAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    ADOPT_STARTER_FORM,
    async ({ db, actor, signal }, { starterId }) => {
      const result = await adoptStarter(db, actor, starterId, signal)
      if (result.ok) {
        return {
          ok: true,
          message: `Adopted ${result.value.versionIds.length} configuration items.`,
        }
      }
      if (typeof result.error === 'string') return { ok: false, error: errorCopy(result.error) }
      return {
        ok: false,
        error: 'The starter did not pass the checks for putting it into use.',
        fieldErrors: fieldErrorsFor(result.error),
      }
    },
  )
}

const PATH_FIELD = 'path:'

interface Selection {
  kind: ConfigKind
  key: string
  paths: string[]
}

function selectedPaths(formData: FormData): Map<string, Selection> {
  const grouped = new Map<string, Selection>()
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
  return await runStaffForm(formData, NO_FIELDS, async ({ db, actor, signal }) => {
    const selections = [...selectedPaths(formData).values()]
    if (selections.length === 0) return { ok: false, error: 'Select at least one change to apply.' }
    for (const selection of selections) {
      const result = await applyStarterPaths(db, actor, selection, signal)
      if (result.ok) continue
      if (typeof result.error === 'string') return { ok: false, error: errorCopy(result.error) }
      return {
        ok: false,
        error: `The change to ${selection.key} did not pass the checks for putting it into use.`,
        fieldErrors: fieldErrorsFor(result.error),
      }
    }
    return { ok: true, message: `Applied changes to ${selections.length} configuration items.` }
  })
}
