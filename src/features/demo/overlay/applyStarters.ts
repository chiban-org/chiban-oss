import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { adoptStarter } from '@/features/config/adoptStarter'
import { checkApplicationType } from '@/features/config/publishChecks'
import { noticeFeesFor, starterByTypeKey, typeEntry } from '@/features/demo/overlay/checkOverlay'
import { DemoOverlayError, failWith, joinPath } from '@/features/demo/overlay/overlayIssue'
import { planType } from '@/features/demo/overlay/planType'
import {
  type OverlayRun,
  publishedBody,
  publishIssue,
  publishOverlayBody,
} from '@/features/demo/overlay/publishOverlay'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { FormBody } from '@/features/forms/formSchema'

export interface StarterOverlayReport {
  notInstalled: string[]
  changedTypes: string[]
}

async function adoptListed(run: OverlayRun): Promise<string[]> {
  const notInstalled: string[] = []
  for (const [i, key] of (run.overlay.starters ?? []).entries()) {
    const starter = starterByTypeKey(key)
    if (starter === undefined) {
      notInstalled.push(key)
      continue
    }
    const adopted = await adoptStarter(run.db, run.actor, starter.id, run.signal)
    if (!adopted.ok && adopted.error !== 'already_adopted') {
      throw new DemoOverlayError(publishIssue(joinPath('starters', i), adopted.error))
    }
  }
  return notInstalled
}

async function applyType(run: OverlayRun, key: string): Promise<boolean> {
  const path = joinPath('applicationTypes', key)
  const type = await publishedBody<ApplicationTypeBody>(run, {
    kind: 'application_type',
    key,
    path,
  })
  const form = await publishedBody<FormBody>(run, { kind: 'form', key: type.formKey, path })
  const fee = await publishedBody<FeeScheduleBody>(run, {
    kind: 'fee_schedule',
    key: type.feeScheduleKey,
    path,
  })
  const plan = planType({
    typeKey: key,
    entry: typeEntry(run.overlay, key),
    form,
    fee,
    noticeFees: noticeFeesFor(run.overlay, type.classification),
  })
  if (!plan.ok) {
    failWith(plan.error)
    return false
  }
  if (plan.value.form === null && plan.value.fee === null) return false
  if (plan.value.form !== null) {
    await publishOverlayBody(run, {
      kind: 'form',
      key: type.formKey,
      body: plan.value.form,
      path: joinPath(path, 'formFields'),
    })
  }
  if (plan.value.fee !== null) {
    await publishOverlayBody(run, {
      kind: 'fee_schedule',
      key: type.feeScheduleKey,
      body: plan.value.fee,
      path: joinPath(path, 'fees'),
    })
  }
  const problem = await run.db.transaction((tx) => checkApplicationType(tx, type, run.signal))
  if (problem !== null) throw new DemoOverlayError(publishIssue(path, problem))
  return true
}

export async function applyOverlayStarters(run: OverlayRun): Promise<StarterOverlayReport> {
  run.signal.throwIfAborted()
  const notInstalled = await adoptListed(run)
  const changedTypes: string[] = []
  for (const key of run.overlay.starters ?? []) {
    if (notInstalled.includes(key)) continue
    if (await applyType(run, key)) changedTypes.push(key)
  }
  return { notInstalled, changedTypes }
}
