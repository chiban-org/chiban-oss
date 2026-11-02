import { err, ok } from '@/types/result'
import type { AlertChannel, AlertMessage } from './types'

export const PAGER_CHANNEL_STATUS = 'stubbed' as const

export const PAGER_STUB_NOTICE =
  'Pager alerts are not connected to a live service. They are sent to the address you configured and have only been tested against a local stand-in.'

export const DEFAULT_PAGER_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue'

const ACCEPTED = 202

export interface PagerConfig {
  eventsUrl: string
  routingKey: string
}

function eventBody(config: PagerConfig, msg: AlertMessage) {
  return {
    routing_key: config.routingKey,
    event_action: msg.state === 'resolved' ? 'resolve' : 'trigger',
    dedup_key: msg.key,
    payload: { summary: msg.summary, source: msg.townName, severity: msg.severity },
    ...(msg.ackUrl === null ? {} : { links: [{ href: msg.ackUrl, text: 'Confirm receipt' }] }),
  }
}

export function createPagerChannel(
  config: PagerConfig,
  deps: { fetch: typeof fetch },
): AlertChannel {
  return {
    kind: 'pager',
    async send(msg, signal) {
      signal.throwIfAborted()
      try {
        const response = await deps.fetch(config.eventsUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(eventBody(config, msg)),
          signal,
        })
        return response.status === ACCEPTED ? ok(undefined) : err('send_failed')
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err('send_failed')
      }
    },
  }
}
