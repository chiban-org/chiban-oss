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

function licenseOf(data: FormData): QuickIssueInput['license'] | null | undefined {
  const number = field(data, 'licenseNumber')
  const type = field(data, 'licenseType')
  const result = field(data, 'licenseResult')
  if (number === '' && type === '' && result === '') return undefined
  if (number === '' || type === '' || !(LICENSE_RESULTS as readonly string[]).includes(result)) {
    return null
  }
  const note = field(data, 'licenseNote')
  return { number, type, result: result as LicenseResult, ...(note === '' ? {} : { note }) }
}

export function parseQuickIssue(data: FormData): Result<QuickIssueInput, 'invalid_input'> {
  const parcelId = field(data, 'parcelId')
  const payment = paymentOf(data)
  const license = licenseOf(data)
  const name = field(data, 'contractorName')
  const fieldsOk = isUuid(parcelId) && name !== '' && field(data, 'typeKey') !== ''
  if (!fieldsOk || payment === null || license === null) return err('invalid_input')
  const retry = field(data, 'applicationId')
  const email = field(data, 'contractorEmail')
  return ok({
    parcelId,
    applicationTypeKey: field(data, 'typeKey'),
    values: workValues(data),
    contractor: { name, ...(email === '' ? {} : { email }) },
    ...(license === undefined ? {} : { license }),
    payerName: field(data, 'payerName') || name,
    payment,
    ...(isUuid(retry) ? { applicationId: retry } : {}),
  })
}
