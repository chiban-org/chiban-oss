import { env } from '@/config/env'
import type { NotificationEvent } from '@/db/schema'
import type { SystemClaimLink } from '@/features/contractors/systemClaim'
import { wordingValues } from '@/features/notifications/messageValues'
import type { NotificationPayload } from '@/features/notifications/queue'
import {
  type RenderedMessage,
  renderWording,
  type WordingLink,
} from '@/features/notifications/wording/renderWording'
import { DEFAULT_WORDING, type Wording } from '@/features/notifications/wording/wordingDefaults'
import type { WordingKey } from '@/features/notifications/wording/wordingKeys'
import type { NotificationWordingBody } from '@/features/notifications/wording/wordingSchema'

export type Rendered = RenderedMessage

export interface Context {
  applicationId: string
  payload: NotificationPayload
  townName: string
  wording?: NotificationWordingBody['events']
  claim?: Pick<SystemClaimLink, 'link' | 'days'>
}

const OPEN = 'Open the application'

function applicationLink(ctx: Context): WordingLink {
  if (ctx.claim === undefined) {
    return { href: `${env.BASE_URL}/portal/applications/${ctx.applicationId}`, label: OPEN }
  }
  return {
    href: ctx.claim.link,
    label: 'Claim the application',
    note: `You do not have an account with the town yet. This link lets you claim the application and follow it online. It works once and expires in ${ctx.claim.days} days.`,
  }
}

function reviewLink(ctx: Context): WordingLink {
  const { assignmentId } = ctx.payload
  const href =
    assignmentId === undefined
      ? `${env.BASE_URL}/staff/reviews`
      : `${env.BASE_URL}/staff/reviews/${assignmentId}`
  return { href, label: OPEN }
}

function staffRecordLink(ctx: Context): WordingLink {
  return { href: `${env.BASE_URL}/staff/applications/${ctx.applicationId}`, label: OPEN }
}

const portalLink = (): WordingLink => ({ href: `${env.BASE_URL}/portal`, label: OPEN })
const boardLink = (): WordingLink => ({
  href: `${env.BASE_URL}/board`,
  label: 'Open the board pages',
})

const DEFAULTS = new Map<string, Wording>(Object.entries(DEFAULT_WORDING))

export function wordingFor(
  key: WordingKey,
  overrides: NotificationWordingBody['events'] | undefined,
): Wording {
  const found = overrides === undefined ? undefined : new Map(Object.entries(overrides)).get(key)
  return found ?? DEFAULTS.get(key) ?? { subject: '', body: '' }
}

function render(key: WordingKey, link: (ctx: Context) => WordingLink) {
  return (ctx: Context): Rendered =>
    renderWording(
      wordingFor(key, ctx.wording),
      wordingValues({
        payload: ctx.payload,
        townName: ctx.townName,
        claimed: ctx.claim !== undefined,
      }),
      link(ctx),
    )
}

type Builder = (ctx: Context) => Rendered

const correctedForParty = render('permit_corrected', applicationLink)
const correctedForRemoved = render('permit_corrected_contractor_removed', portalLink)

export const MESSAGES: Record<NotificationEvent, Builder> = {
  application_submitted: render('application_submitted', applicationLink),
  fees_due: render('fees_due', applicationLink),
  payment_received: render('payment_received', applicationLink),
  application_issued: render('application_issued', applicationLink),
  application_denied: render('application_denied', applicationLink),
  inspection_scheduled: render('inspection_scheduled', applicationLink),
  inspection_cancelled: render('inspection_cancelled', applicationLink),
  inspection_result: render('inspection_result', applicationLink),
  permit_corrected: (c) =>
    c.payload.contractorRemoved === true ? correctedForRemoved(c) : correctedForParty(c),
  review_assigned: render('review_assigned', reviewLink),
  board_comment_requested: render('board_comment_requested', boardLink),
  clock_due_soon: render('clock_due_soon', staffRecordLink),
  clock_overdue: render('clock_overdue', staffRecordLink),
  decision_filed: render('decision_filed', applicationLink),
}
