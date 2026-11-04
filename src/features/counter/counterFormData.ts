import type { DbOrTx } from '@/db/client'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
import { computeFees } from '@/features/fees/computeFees'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import { type FormBody, type FormField, questionsOf } from '@/features/forms/formSchema'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { getActiveProcessor } from '@/features/payments/processorAccounts'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'

const LICENSE_FIELD = 'contractor_license_number'

export interface CounterFormData {
  fields: FormField[]
  baseCents: number
  convenienceFee: PaymentSettingsBody['convenienceFee']
  cardAvailable: boolean
  readerSimulated: boolean
}

export async function loadCounterFormData(
  db: DbOrTx,
  typeKey: string,
  signal: AbortSignal,
): Promise<CounterFormData | null> {
  const type = await getPublished(db, 'application_type', typeKey, signal)
  if (type === null) return null
  const typeBody = type.body as ApplicationTypeBody
  const form = await getPublished(db, 'form', typeBody.formKey, signal)
  const fee = await getPublished(db, 'fee_schedule', typeBody.feeScheduleKey, signal)
  if (form === null || fee === null) return null
  const computed = computeFees(fee.body as FeeScheduleBody, {
    values: {},
    facts: { classification: null, dwellingUnits: null, afterTheFact: false },
    counts: { abutters: { state: 'unknown' } },
    stage: 'at_intake',
    overrides: [],
  })
  if (computed.totalCents === null) return null
  const settings = await getPaymentSettings(db, signal)
  const processor = await getActiveProcessor(db, signal)
  return {
    fields: questionsOf((form.body as FormBody).fields).filter((f) => f.key !== LICENSE_FIELD),
    baseCents: computed.totalCents,
    convenienceFee: settings.convenienceFee,
    cardAvailable: processor.state === 'known',
    readerSimulated:
      processor.state === 'known' && processor.value.account.processor === 'simulated',
  }
}
