import { env } from '@/config/env'
import type { NotificationEvent } from '@/db/schema'
import type { NotificationPayload } from '@/features/notifications/queue'
import { formatCents } from '@/lib/money'

export interface Rendered {
  subject: string
  text: string
  html: string
}

interface Context {
  applicationId: string
  payload: NotificationPayload
}

function portalLink(applicationId: string): string {
  return `${env.BASE_URL}/portal/applications/${applicationId}`
}

function reviewLink(ctx: Context): string {
  const { assignmentId } = ctx.payload
  return assignmentId === undefined
    ? `${env.BASE_URL}/staff/reviews`
    : `${env.BASE_URL}/staff/reviews/${assignmentId}`
}

function compose(subject: string, lines: string[], link: string): Rendered {
  return {
    subject,
    text: `${lines.join('\n\n')}\n\n${link}\n`,
    html: `${lines.map((l) => `<p>${l}</p>`).join('')}<p><a href="${link}">Open the application</a></p>`,
  }
}

type Builder = (ctx: Context) => Rendered

export const MESSAGES: Record<NotificationEvent, Builder> = {
  application_submitted: (c) =>
    compose(
      `Application ${c.payload.number} received`,
      [`The Town of Alder Pond received application ${c.payload.number}.`],
      portalLink(c.applicationId),
    ),
  fees_due: (c) => {
    const amount = formatCents(c.payload.amountCents ?? 0)
    return compose(
      `Fees due for ${c.payload.number}: ${amount}`,
      [`Application ${c.payload.number} has fees due: ${amount}. You can pay online.`],
      portalLink(c.applicationId),
    )
  },
  payment_received: (c) =>
    compose(
      `Payment received, receipt ${c.payload.receiptNumber ?? ''}`.trim(),
      [`The town received a payment for application ${c.payload.number}.`],
      portalLink(c.applicationId),
    ),
  application_issued: (c) =>
    compose(
      `Permit ${c.payload.number} issued`,
      [`Permit ${c.payload.number} was issued. You can download it from your account.`],
      portalLink(c.applicationId),
    ),
  application_denied: (c) =>
    compose(
      `Application ${c.payload.number} denied`,
      [`Application ${c.payload.number} was denied. Open the application for the details.`],
      portalLink(c.applicationId),
    ),
  inspection_scheduled: (c) =>
    compose(
      `Inspection scheduled: ${c.payload.number}, ${c.payload.inspectionLabel ?? ''} on ${c.payload.onDate ?? ''} at ${c.payload.atTime ?? ''}`,
      [
        `An inspection for ${c.payload.number} is scheduled for ${c.payload.onDate ?? ''} at ${c.payload.atTime ?? ''}. Someone should be at the site.`,
      ],
      portalLink(c.applicationId),
    ),
  inspection_cancelled: (c) =>
    compose(
      `Inspection cancelled: ${c.payload.number}, ${c.payload.inspectionLabel ?? ''}`,
      [
        `The ${c.payload.inspectionLabel ?? ''} inspection for ${c.payload.number} was cancelled. Open the application for the details.`,
      ],
      portalLink(c.applicationId),
    ),
  inspection_result: (c) =>
    compose(
      `Inspection ${c.payload.result ?? ''}: ${c.payload.number}, ${c.payload.inspectionLabel ?? ''}`,
      [
        `The ${c.payload.inspectionLabel ?? ''} inspection for ${c.payload.number} ${c.payload.result ?? 'was recorded'}. Open the application for the details.`,
      ],
      portalLink(c.applicationId),
    ),
  review_assigned: (c) =>
    compose(
      `Review requested: ${c.payload.number}`,
      [`You were asked to review application ${c.payload.number}.`],
      reviewLink(c),
    ),
}
