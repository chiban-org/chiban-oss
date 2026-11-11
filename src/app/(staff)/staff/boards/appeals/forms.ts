import { z } from 'zod'
import { civilDate, requiredText } from '@/features/input/schemas'

export const ADMINISTRATIVE_DECISION_FORM = z.object({
  applicationNumber: requiredText('the application or permit number', { max: 100 }),
  occurredOn: civilDate('the date of the decision'),
})
