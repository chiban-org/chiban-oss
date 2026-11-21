import { z } from 'zod'
import { civilDate, optionalText, recordId, requiredText } from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'

export const placeHoldForm = (today: CivilDate) =>
  z.object({
    caseId: recordId('a case'),
    placedOn: civilDate('the date the hold is placed', { latest: today }),
  })

export const releaseHoldForm = (today: CivilDate) =>
  z.object({
    holdId: recordId('a hold'),
    releasedOn: civilDate('the date the hold is released', { latest: today }),
  })

export const holdPermitForm = (today: CivilDate) =>
  z.object({
    holdId: recordId('a hold'),
    applicationId: recordId('a permit'),
    actedOn: civilDate('the date', { latest: today }),
  })

export const civilActionForm = (today: CivilDate) =>
  z.object({
    caseId: recordId('a case'),
    filedOn: civilDate('the date filed', { latest: today }),
    court: requiredText('the court', { max: 200 }),
    docket: optionalText('the docket number', { max: 100 }),
  })
