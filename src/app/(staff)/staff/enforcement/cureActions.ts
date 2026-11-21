'use server'

import {
  applyCureProcedure,
  recordCureReturnReceipt,
  sendCureNotice,
} from '@/features/enforcement/cureNotices'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { applyCureForm, cureReceiptForm, sendCureNoticeForm } from './cureForms'
import { settled } from './enforcementResult'

export async function applyCureProcedureAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, applyCureForm, async ({ db, actor, signal }, input) =>
    settled(await applyCureProcedure(db, actor, input, signal), 'Procedure saved.', {
      unknown_rule: 'ruleKey',
    }),
  )
}

export async function sendCureNoticeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    sendCureNoticeForm,
    async ({ db, actor, signal }, input) => {
      const { occupantName, occupantAddress } = input
      if ((occupantName === null) !== (occupantAddress === null)) {
        return refuseField(
          occupantName === null ? 'occupantName' : 'occupantAddress',
          'Enter both the occupant name and mailing address, or leave both blank when no occupant applies.',
        )
      }
      return settled(
        await sendCureNotice(
          db,
          actor,
          {
            caseId: input.caseId,
            findingIds: input.findingIds,
            owner: { name: input.ownerName, mailingAddress: input.ownerAddress },
            occupant:
              occupantName === null || occupantAddress === null
                ? 'none'
                : { name: occupantName, mailingAddress: occupantAddress },
            sentOn: input.sentOn,
            documentId: null,
          },
          signal,
        ),
        'Cure notice recorded.',
        { future_date: 'sentOn', finding_not_open: 'findingIds', no_open_findings: 'findingIds' },
      )
    },
  )
}

export async function recordCureReceiptAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, cureReceiptForm, async ({ db, actor, signal }, input) =>
    settled(await recordCureReturnReceipt(db, actor, input, signal), 'Return receipt recorded.', {
      before_sent: 'receivedOn',
      future_date: 'receivedOn',
    }),
  )
}
