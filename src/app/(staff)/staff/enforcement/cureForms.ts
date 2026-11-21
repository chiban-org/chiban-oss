import { z } from 'zod'
import { civilDate, optionalText, recordId, requiredText } from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'
import { recordIdList } from './inputFields'

export const applyCureForm = z.object({
  caseId: recordId('a case'),
  ruleKey: optionalText('a procedure', { max: 200 }),
})

export const sendCureNoticeForm = (today: CivilDate) =>
  z.object({
    caseId: recordId('a case'),
    findingIds: recordIdList('Choose at least one finding.'),
    ownerName: requiredText('the owner name', { max: 200 }),
    ownerAddress: requiredText('the owner mailing address', { max: 400 }),
    occupantName: optionalText('the occupant name', { max: 200 }),
    occupantAddress: optionalText('the occupant mailing address', { max: 400 }),
    sentOn: civilDate('the date mailed', { latest: today }),
  })

export const cureReceiptForm = (today: CivilDate) =>
  z.object({
    cureNoticeId: recordId('a cure notice'),
    receivedOn: civilDate('the date on the return receipt', { latest: today }),
  })
