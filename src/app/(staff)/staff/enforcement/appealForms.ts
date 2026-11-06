import { z } from 'zod'
import { ENFORCEMENT_APPEAL_OUTCOMES, PERIL_CATEGORIES } from '@/db/schema'
import { choice, civilDate, recordId, requiredText } from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'
import { prefixedRecordId, requiredRecordId } from './inputFields'

const APPEAL_TARGETS = ['order', 'notice'] as const

export const APPEAL_FORM = z
  .object({
    caseId: recordId('a case'),
    target: prefixedRecordId(APPEAL_TARGETS, 'Choose what is appealed.'),
    appellantName: requiredText('the appellant', { max: 200 }),
    filedOn: civilDate('the date filed'),
  })
  .transform(({ target, ...rest }) => ({ ...rest, targetKind: target.kind, targetId: target.id }))

export const RESOLVE_APPEAL_FORM = z.object({
  appealId: recordId('an appeal'),
  outcome: choice('a decision', ENFORCEMENT_APPEAL_OUTCOMES),
  resolvedOn: civilDate('the date decided'),
})

export const certifyPerilForm = (today: CivilDate) =>
  z.object({
    appealId: recordId('an appeal'),
    category: choice('what is at risk', PERIL_CATEGORIES),
    statement: requiredText('a statement', { max: 3000 }),
    certifiedOn: civilDate('the date certified', { latest: today }),
  })

export const restrainingOrderForm = (today: CivilDate) =>
  z.object({
    appealId: recordId('an appeal'),
    issuedBy: choice('who issued it', ['zba', 'superior_court'] as const),
    issuedOn: civilDate('the date issued', { latest: today }),
    documentId: requiredRecordId(
      'Choose the court document. Upload it in the Documents section first, as a court document.',
    ),
  })

export const dissolveRestrainingOrderForm = (today: CivilDate) =>
  z.object({
    restrainingOrderId: recordId('a restraining order'),
    dissolvedOn: civilDate('the date dissolved', { latest: today }),
  })
