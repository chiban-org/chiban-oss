import { z } from 'zod'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import type { MailTransport } from '@/features/mail/transport'
import { insertRequest } from '@/features/rtk/requests'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { log } from '@/server/log'
import { createRateLimiter } from '@/server/rateLimiter'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const MAX_REQUEST_CHARS = 5000
const HOUR_MS = 60 * 60 * 1000
const PER_ADDRESS = 3
const PER_CLIENT = 10

const byAddress = createRateLimiter({ max: PER_ADDRESS, windowMs: HOUR_MS })
const byClient = createRateLimiter({ max: PER_CLIENT, windowMs: HOUR_MS })

export function resetOnlineRequestLimits(): void {
  byAddress.reset()
  byClient.reset()
}

const OnlineSchema = z.object({
  requesterName: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().min(1).max(MAX_REQUEST_CHARS),
  clientKey: z.string().min(1).max(200),
})

export type OnlineRequestInput = z.input<typeof OnlineSchema>

export interface OnlineRequestReceipt {
  requestId: string
  number: string
  receivedOn: CivilDate
  due: CivilDate
  emailed: boolean
}

function takeAllowance(email: string, clientKey: string): boolean {
  byAddress.prune()
  byClient.prune()
  if (byAddress.isLimited(email) || byClient.isLimited(clientKey)) return false
  byAddress.recordFailure(email)
  byClient.recordFailure(clientKey)
  return true
}

async function sendReceipt(
  mail: MailTransport,
  to: string,
  receipt: Omit<OnlineRequestReceipt, 'emailed' | 'requestId'>,
  signal: AbortSignal,
): Promise<boolean> {
  const received = formatCivilDate(receipt.receivedOn)
  const due = formatCivilDate(receipt.due)
  const lines = [
    `The town received your Right-to-Know request on ${received}. Its number is ${receipt.number}.`,
    `The town will answer by ${due}. It will make the records available, deny the request in writing, or tell you in writing when it will answer.`,
    'Keep the request number if you need to ask about it.',
  ]
  const sent = await mail.send(
    {
      to,
      subject: `Right-to-Know request ${receipt.number} received`,
      text: `${lines.join('\n\n')}\n\n${env.BASE_URL}\n`,
      html: lines.map((line) => `<p>${line}</p>`).join(''),
    },
    signal,
  )
  if (!sent.ok) log.warn('[rtk] online request receipt not sent', receipt.number)
  return sent.ok
}

export interface OnlineRequestContext {
  db: Db
  mail: MailTransport
  signal: AbortSignal
  now?: Date
}

export async function submitOnlineRequest(
  context: OnlineRequestContext,
  input: OnlineRequestInput,
): Promise<Result<OnlineRequestReceipt, 'invalid' | 'rate_limited'>> {
  const { db, mail, signal, now = new Date() } = context
  signal.throwIfAborted()
  const parsed = OnlineSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (!takeAllowance(value.email, value.clientKey)) return err('rate_limited')
  const receivedOn = await townToday(db, now, signal)
  const created = await db.transaction(
    async (tx) =>
      await insertRequest(
        tx,
        {
          receivedOn,
          receivedVia: 'portal',
          requesterName: value.requesterName,
          requesterContact: [value.email, value.phone].filter((v) => v !== undefined).join(', '),
          description: value.description,
          createdBy: null,
        },
        { kind: 'system', job: 'rtk.online_request' },
        signal,
      ),
  )
  const receipt = { number: created.number, receivedOn, due: created.due }
  const emailed = await sendReceipt(mail, value.email, receipt, signal)
  return ok({ requestId: created.requestId, ...receipt, emailed })
}
