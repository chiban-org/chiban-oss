import { env } from '@/config/env'
import { getMailTransport, type MailTransport } from '@/features/mail/transport'
import { createEmailChannel } from './emailChannel'
import { createPagerChannel, DEFAULT_PAGER_EVENTS_URL } from './pagerChannel'
import type { AlertChannel, AlertChannelKind } from './types'

export function configuredChannelKinds(): AlertChannelKind[] {
  const kinds: AlertChannelKind[] = []
  if (env.ALERT_EMAIL_TO.length > 0) kinds.push('email')
  if (env.PAGER_ROUTING_KEY !== undefined) kinds.push('pager')
  return kinds
}

export function configuredChannels(
  mail: MailTransport = getMailTransport(),
  fetcher: typeof fetch = fetch,
): AlertChannel[] {
  const channels: AlertChannel[] = []
  if (env.ALERT_EMAIL_TO.length > 0) channels.push(createEmailChannel(mail, env.ALERT_EMAIL_TO))
  if (env.PAGER_ROUTING_KEY !== undefined) {
    channels.push(
      createPagerChannel(
        {
          eventsUrl: env.PAGER_EVENTS_URL ?? DEFAULT_PAGER_EVENTS_URL,
          routingKey: env.PAGER_ROUTING_KEY,
        },
        { fetch: fetcher },
      ),
    )
  }
  return channels
}
