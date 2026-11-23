import { z } from 'zod'
import { choice, optionalText, recordId } from '@/features/input/schemas'
import { valueList } from './formFields'

const applicationId = () => recordId('an application')

export const PREPARE_RECEIPT_FORM = z.object({ applicationId: applicationId() })

export const SOURCE_WATER_FORM = z.object({
  applicationId: applicationId(),
  determination: choice('a determination', ['within', 'not_within'] as const),
  supplierKey: optionalText('a water supplier', { max: 100 }),
})

export const MUNICIPALITIES_FORM = z.object({
  applicationId: applicationId(),
  abuttingKeys: valueList(),
  includedKeys: valueList(),
})
