import type { DbOrTx } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import type { FieldError } from '@/features/forms/validateSubmission'
import { assessCorrection } from '@/features/permits/correction/assessCorrection'
import {
  activeParties,
  type ContractorChoice,
  planContractor,
} from '@/features/permits/correction/contractor'
import { isCorrectablePermit, mayCorrectPermits } from '@/features/permits/correction/policy'
import { correctionRecipients, recipientLabel } from '@/features/permits/correction/recipients'
import { err, ok, type Result } from '@/types/result'

export interface CorrectionDraft {
  applicationId: string
  values: Record<string, unknown>
  contractor: ContractorChoice
}

export interface CorrectionCheck {
  nextRevision: number
  feeChange: boolean
  review: string[]
  fieldErrors: FieldError[]
  notify: string[]
}

export type CheckError = 'forbidden' | 'not_found' | 'not_correctable'

export async function checkCorrection(
  db: DbOrTx,
  actor: Actor,
  draft: CorrectionDraft,
  signal: AbortSignal,
): Promise<Result<CorrectionCheck, CheckError>> {
  signal.throwIfAborted()
  if (!(await mayCorrectPermits(db, actor, signal))) return err('forbidden')
  const app = await loadApplicationContext(db, draft.applicationId, signal)
  if (app === null) return err('not_found')
  if (!isCorrectablePermit(app)) return err('not_correctable')
  const assessed = await assessCorrection(db, app, draft.values, signal)
  const parties = await activeParties(db, app.projectId)
  const plan = planContractor(parties, draft.contractor)
  const recipients = plan.ok ? correctionRecipients(parties, plan.value) : []
  return ok({
    nextRevision: app.permitRevision + 1,
    feeChange: assessed.ok && assessed.value.feeChange,
    review: assessed.ok ? assessed.value.review : [],
    fieldErrors: assessed.ok ? [] : assessed.error.fieldErrors,
    notify: recipients.map(recipientLabel),
  })
}
