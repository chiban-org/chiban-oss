import { env } from '@/config/env'
import type { NotificationEvent } from '@/db/schema'
import type { SystemClaimLink } from '@/features/contractors/systemClaim'
import type { NotificationPayload } from '@/features/notifications/queue'
import { boardCommentMessage } from '@/features/reviews/boardCommentMail'
import { humanizeIsoDates } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

export interface Rendered {
  subject: string
  text: string
  html: string
}

export interface Context {
  applicationId: string
  payload: NotificationPayload
  claim?: Pick<SystemClaimLink, 'link' | 'days'>
}

interface Link {
  href: string
  label: string
  note?: string
}

function longDate(onDate: string | undefined): string {
  return humanizeIsoDates(onDate ?? '')
}

const OPEN = 'Open the application'

function applicationLink(ctx: Context): Link {
  if (ctx.claim === undefined) {
    return { href: `${env.BASE_URL}/portal/applications/${ctx.applicationId}`, label: OPEN }
  }
  return {
    href: ctx.claim.link,
    label: 'Claim the application',
    note: `You do not have an account with the town yet. This link lets you claim the application and follow it online. It works once and expires in ${ctx.claim.days} days.`,
  }
}

function inAccount(ctx: Context, preposition: 'in' | 'from'): string {
  return ctx.claim === undefined
    ? `${preposition} your account`
    : 'online once you claim the application'
}

function reviewLink(ctx: Context): Link {
  const { assignmentId } = ctx.payload
  const href =
    assignmentId === undefined
      ? `${env.BASE_URL}/staff/reviews`
      : `${env.BASE_URL}/staff/reviews/${assignmentId}`
  return { href, label: OPEN }
}

function compose(subject: string, body: string[], link: Link): Rendered {
  const lines = link.note === undefined ? body : [...body, link.note]
  return {
    subject,
    text: `${lines.join('\n\n')}\n\n${link.href}\n`,
    html: `${lines.map((l) => `<p>${l}</p>`).join('')}<p><a href="${link.href}">${link.label}</a></p>`,
  }
}

type Builder = (ctx: Context) => Rendered

export const MESSAGES: Record<NotificationEvent, Builder> = {
  application_submitted: (c) =>
    compose(
      `Application ${c.payload.number} received`,
      [`The Town of Alder Pond received application ${c.payload.number}.`],
      applicationLink(c),
    ),
  fees_due: (c) => {
    const amount = formatCents(c.payload.amountCents ?? 0)
    return compose(
      `Fees due for ${c.payload.number}: ${amount}`,
      [`Application ${c.payload.number} has fees due: ${amount}. You can pay online.`],
      applicationLink(c),
    )
  },
  payment_received: (c) =>
    compose(
      `Payment received, receipt ${c.payload.receiptNumber ?? ''}`.trim(),
      [`The town received a payment for application ${c.payload.number}.`],
      applicationLink(c),
    ),
  application_issued: (c) =>
    compose(
      `Permit ${c.payload.number} issued`,
      [`Permit ${c.payload.number} was issued. You can download it ${inAccount(c, 'from')}.`],
      applicationLink(c),
    ),
  application_denied: (c) =>
    compose(
      `Application ${c.payload.number} denied`,
      [`Application ${c.payload.number} was denied. Open the application for the details.`],
      applicationLink(c),
    ),
  inspection_scheduled: (c) =>
    compose(
      `Inspection scheduled: ${c.payload.number}, ${c.payload.inspectionLabel ?? ''} on ${longDate(c.payload.onDate)} at ${c.payload.atTime ?? ''}`,
      [
        `An inspection for ${c.payload.number} is scheduled for ${longDate(c.payload.onDate)} at ${c.payload.atTime ?? ''}. Someone should be at the site.`,
      ],
      applicationLink(c),
    ),
  inspection_cancelled: (c) =>
    compose(
      `Inspection cancelled: ${c.payload.number}, ${c.payload.inspectionLabel ?? ''}`,
      [
        `The ${c.payload.inspectionLabel ?? ''} inspection for ${c.payload.number} was cancelled. Open the application for the details.`,
      ],
      applicationLink(c),
    ),
  inspection_result: (c) =>
    compose(
      `Inspection ${c.payload.result ?? ''}: ${c.payload.number}, ${c.payload.inspectionLabel ?? ''}`,
      [
        `The ${c.payload.inspectionLabel ?? ''} inspection for ${c.payload.number} ${c.payload.result ?? 'was recorded'}. Open the application for the details.`,
      ],
      applicationLink(c),
    ),
  permit_corrected: (c) =>
    c.payload.contractorRemoved === true
      ? compose(
          `Permit ${c.payload.number} corrected`,
          [
            `Permit ${c.payload.number} was corrected and reissued as revision ${c.payload.revision ?? ''}. You are no longer listed as its contractor.`,
          ],
          { href: `${env.BASE_URL}/portal`, label: OPEN },
        )
      : compose(
          `Permit ${c.payload.number} corrected`,
          [
            `Permit ${c.payload.number} was corrected and reissued as revision ${c.payload.revision ?? ''}. The corrected permit is ${inAccount(c, 'in')}; the earlier copy stays listed under it.`,
          ],
          applicationLink(c),
        ),
  review_assigned: (c) =>
    compose(
      `Review requested: ${c.payload.number}`,
      [`You were asked to review application ${c.payload.number}.`],
      reviewLink(c),
    ),
  board_comment_requested: (c) =>
    boardCommentMessage({
      boardName: c.payload.boardName ?? 'board',
      number: c.payload.number,
      projectTitle: c.payload.projectTitle ?? '',
      commentBy: c.payload.commentBy ?? null,
    }),
}
