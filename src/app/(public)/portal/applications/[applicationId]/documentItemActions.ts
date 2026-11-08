'use server'

import type { z } from 'zod'
import {
  ItemFileForm,
  ItemForm,
  ItemReasonForm,
  itemOutcome,
} from '@/features/applications/documentItemForms'
import {
  linkDocument,
  requestWaiver,
  unlinkDocument,
  withdrawWaiver,
} from '@/features/applications/documentItems'
import type { ActionResult } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { type PortalActionContext, withPortalActor } from '@/server/portalAction'

const fail = (error: string): ActionResult => ({ ok: false, error })

async function run<S extends z.ZodType>(
  formData: FormData,
  schema: S,
  fn: (ctx: PortalActionContext, input: z.output<S>) => Promise<ActionResult>,
): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async (ctx) => {
    const parsed = parseForm(schema, formData)
    return parsed.ok ? await fn(ctx, parsed.value) : parsed.error
  })
}

export async function linkItemAction(formData: FormData): Promise<ActionResult> {
  return await run(formData, ItemFileForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await linkDocument(db, actor, input, signal), 'File added to this document.'),
  )
}

export async function unlinkItemAction(formData: FormData): Promise<ActionResult> {
  return await run(formData, ItemFileForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await unlinkDocument(db, actor, input, signal), 'File removed from this document.'),
  )
}

export async function requestWaiverAction(formData: FormData): Promise<ActionResult> {
  return await run(formData, ItemReasonForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await requestWaiver(db, actor, input, signal), 'Waiver requested.'),
  )
}

export async function withdrawWaiverAction(formData: FormData): Promise<ActionResult> {
  return await run(formData, ItemForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await withdrawWaiver(db, actor, input, signal), 'Waiver request withdrawn.'),
  )
}
