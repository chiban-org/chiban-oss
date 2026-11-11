import { NH_RTK_EXEMPTIONS, OTHER_LAW_EXEMPTION_KEY } from '@packs/nh/rtkExemptions'
import { z } from 'zod'
import {
  RTK_RECEIVED_VIA,
  RTK_RELEASE_METHODS,
  RTK_RESPONSE_KINDS,
  RTK_WITHHOLDING_SCOPES,
} from '@/db/schema'
import { inputField } from '@/features/input/field'
import { optionalEmail } from '@/features/input/optionalEmail'
import {
  choice,
  civilDate,
  optionalCivilDate,
  optionalMoneyCents,
  optionalText,
  optionalWebAddress,
  recordId,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'
import { RECORDS_COPY } from '@/server/recordsAction'
import type { CivilDate } from '@/types/civilDate'
import { err, ok } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const MAX_ROW_VERSION = 2_147_483_647
const MIN_EXPLANATION = 20
const MAX_ITEMS = 500
const WEB_ADDRESS_MAX = 500
const CHARGE_ONLY_WITH_MORE_TIME =
  'A charge can only be stated with a response that asks for more time. Clear it or choose that response.'
const ONLY_WITH_MORE_TIME = 'Leave this blank unless the response asks for more time.'
const ONLY_WITH_WEBSITE = 'Leave this blank unless the records are posted online.'
const EXEMPTION_KEYS = [...NH_RTK_EXEMPTIONS.map((e) => e.key), OTHER_LAW_EXEMPTION_KEY] as const

export const requestIdField = () => recordId('a request')

export const logRequestForm = (today: CivilDate) =>
  z.object({
    receivedOn: civilDate('the date received', { latest: today }),
    receivedVia: choice('how it arrived', RTK_RECEIVED_VIA),
    requesterName: optionalText('the requester name', { max: 200 }),
    requesterContact: optionalText('the requester contact', { max: 300 }),
    description: requiredText('what was asked for', { max: 5000 }),
  })

type FirstResponse = {
  kind: string
  respondedOn: CivilDate
  websiteUrl: string | null
  statedDate: CivilDate | null
  delayReason: string | null
  costLabel: string | null
  costDollars: number | null
}

type Refuse = (path: string, message: string) => void

function refuseOutsideTimeStatement(v: FirstResponse, refuse: Refuse): void {
  if (v.statedDate !== null) refuse('statedDate', ONLY_WITH_MORE_TIME)
  if (v.delayReason !== null) refuse('delayReason', ONLY_WITH_MORE_TIME)
  if (v.costLabel !== null) refuse('costLabel', CHARGE_ONLY_WITH_MORE_TIME)
  if (v.costDollars !== null) refuse('costDollars', CHARGE_ONLY_WITH_MORE_TIME)
}

function refuseIncompleteTimeStatement(v: FirstResponse, refuse: Refuse): void {
  if (v.statedDate === null || v.statedDate < v.respondedOn)
    refuse('statedDate', RECORDS_COPY.stated_date_required ?? '')
  if (v.delayReason === null) refuse('delayReason', 'Enter why more time is needed.')
  if (v.costLabel !== null && v.costDollars === null) refuse('costDollars', 'Enter the charge.')
  if (v.costLabel === null && v.costDollars !== null)
    refuse('costLabel', 'Enter what the charge is for.')
}

function refuseMisplacedResponseFields(v: FirstResponse, ctx: z.RefinementCtx): void {
  const refuse: Refuse = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })
  const posted = v.kind === 'website_reference'
  if (posted && v.websiteUrl === null) refuse('websiteUrl', RECORDS_COPY.website_url_required ?? '')
  if (!posted && v.websiteUrl !== null) refuse('websiteUrl', ONLY_WITH_WEBSITE)
  if (v.kind === 'time_statement') refuseIncompleteTimeStatement(v, refuse)
  else refuseOutsideTimeStatement(v, refuse)
}

export const firstResponseForm = (today: CivilDate) =>
  z
    .object({
      requestId: requestIdField(),
      kind: choice('a response', RTK_RESPONSE_KINDS),
      respondedOn: civilDate('the date of the response', { latest: today }),
      websiteUrl: optionalWebAddress('the web address', WEB_ADDRESS_MAX),
      statedDate: optionalCivilDate('the date the town will respond by'),
      delayReason: optionalText('a reason', { max: 2000 }),
      costLabel: optionalText('a charge description', { max: 200 }),
      costDollars: optionalMoneyCents('the charge'),
    })
    .superRefine(refuseMisplacedResponseFields)

export const denyRequestForm = (today: CivilDate) =>
  z.object({
    requestId: requestIdField(),
    deniedOn: civilDate('the date of the denial', { latest: today }),
  })

export const withholdingForm = z
  .object({
    requestId: requestIdField(),
    scope: choice('whether the record is withheld or redacted', RTK_WITHHOLDING_SCOPES),
    recordDescription: requiredText('which record', { max: 1000 }),
    exemptionKey: choice('an exemption', EXEMPTION_KEYS),
    otherCitation: optionalText('the law', { max: 300 }),
    explanation: requiredText('an explanation', { min: MIN_EXPLANATION, max: 3000 }),
  })
  .superRefine((v, ctx) => {
    if (v.exemptionKey === OTHER_LAW_EXEMPTION_KEY && v.otherCitation === null)
      ctx.addIssue({
        code: 'custom',
        path: ['otherCitation'],
        message: RECORDS_COPY.citation_required ?? '',
      })
  })

const TICK_ONE = 'Tick at least one approved record to release.'
const BAD_ITEM = 'Choose approved records to release.'

const releaseItems = () =>
  inputField((raw) => {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    )
    if (values.length === 0) return err(TICK_ONE)
    if (values.length > MAX_ITEMS) return err(BAD_ITEM)
    const items: { documentId: string; approvalId: string }[] = []
    for (const value of values) {
      const [documentId = '', approvalId = '', ...rest] = value.split(':')
      if (rest.length > 0 || !isUuid(documentId) || !isUuid(approvalId)) return err(BAD_ITEM)
      items.push({ documentId, approvalId })
    }
    return ok(items)
  })

export const releaseForm = (today: CivilDate) =>
  z
    .object({
      requestId: requestIdField(),
      items: releaseItems(),
      releasedOn: civilDate('the date released', { latest: today }),
      method: choice('how the records are released', RTK_RELEASE_METHODS),
      recipientEmail: optionalEmail('an email address'),
    })
    .superRefine((v, ctx) => {
      if ((v.method === 'electronic_link' || v.method === 'email') && v.recipientEmail === null)
        ctx.addIssue({
          code: 'custom',
          path: ['recipientEmail'],
          message: RECORDS_COPY.recipient_required ?? '',
        })
    })

export const closeRequestForm = z.object({
  requestId: requestIdField(),
  to: choice('how to close it', ['closed', 'withdrawn'] as const),
  expectedRowVersion: wholeNumber('the version of the request', { min: 1, max: MAX_ROW_VERSION }),
})
