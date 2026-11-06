import { z } from 'zod'
import {
  checkbox,
  civilDate,
  optionalCivilDate,
  optionalText,
  recordId,
} from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'
import { rowVersion } from './caseForms'
import { recordIdList } from './inputFields'

const draftFields = () => ({
  correctiveAction: optionalText('the corrective action', { max: 5000 }),
  correctiveDeadline: optionalCivilDate('the corrective action deadline'),
  ceaseImmediately: checkbox(),
})

export const DRAFT_ORDER_FORM = z.object({
  caseId: recordId('a case'),
  findingIds: recordIdList('Choose at least one finding.'),
  ...draftFields(),
})

export const REVISE_DRAFT_ORDER_FORM = z.object({
  orderId: recordId('an order'),
  expectedRowVersion: rowVersion(),
  ...draftFields(),
})

export const DISCARD_DRAFT_ORDER_FORM = z.object({
  orderId: recordId('an order'),
  expectedRowVersion: rowVersion(),
})

export const issueOrderForm = (today: CivilDate) =>
  z.object({
    orderId: recordId('an order'),
    expectedRowVersion: rowVersion(),
    issuedOn: civilDate('the issue date', { latest: today }),
  })
