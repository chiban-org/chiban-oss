import { LICENSE_RESULTS, type LicenseResult } from '@/db/schema/licenseChecks'
import type { QuickIssueInput } from '@/features/counter/quickIssue'
import { dollarsToCents } from '@/lib/money'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const VALUE_PREFIX = 'value.'

function field(data: FormData, key: string): string {
  const value = data.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function workValues(data: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, raw] of data.entries()) {
    if (!key.startsWith(VALUE_PREFIX) || typeof raw !== 'string') continue
    const name = key.slice(VALUE_PREFIX.length)
    if (raw === 'on') values[name] = true
    else if (raw.trim() !== '') values[name] = raw.trim()
  }
  return values
}

function paymentOf(data: FormData): QuickIssueInput['payment'] | null {
  const method = field(data, 'method')
  if (method === 'card') return { method: 'card' }
  if (method === 'check') return { method: 'check', checkNumber: field(data, 'checkNumber') }
  if (method !== 'cash') return null
  const tendered = field(data, 'tendered')
  if (tendered === '') return { method: 'cash' }
  const cents = dollarsToCents(tendered)
  return cents === null ? null : { method: 'cash', tenderedCents: cents }
}

export { dollarsToCents }

export function parseQuickIssue(data: FormData): Result<QuickIssueInput, 'invalid_input'> {
  const parcelId = field(data, 'parcelId')
  const result = field(data, 'licenseResult')
  const payment = paymentOf(data)
  const name = field(data, 'contractorName')
  const licenseNumber = field(data, 'licenseNumber')
  const licenseType = field(data, 'licenseType')
  const fieldsOk =
    isUuid(parcelId) &&
    (LICENSE_RESULTS as readonly string[]).includes(result) &&
    name !== '' &&
    licenseNumber !== '' &&
    licenseType !== '' &&
    field(data, 'typeKey') !== ''
  if (!fieldsOk || payment === null) return err('invalid_input')
  const email = field(data, 'contractorEmail')
  const note = field(data, 'licenseNote')
  return ok({
    parcelId,
    applicationTypeKey: field(data, 'typeKey'),
    values: workValues(data),
    contractor: { name, ...(email === '' ? {} : { email }), licenseNumber, licenseType },
    licenseCheck: { result: result as LicenseResult, ...(note === '' ? {} : { note }) },
    payerName: field(data, 'payerName') || name,
    payment,
  })
}
