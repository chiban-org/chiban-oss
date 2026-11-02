import type { DbOrTx } from '@/db/client'
import type { CalendarKind } from '@/db/schema'
import { createLazyGraphPublisher } from '@/features/calendar/lazyGraphPublisher'
import type { CalendarPublisher } from '@/features/calendar/publisher'

export interface PublisherFactoryDeps {
  ics: CalendarPublisher
  now: () => Date
  fetch?: typeof fetch
}

export function createPublisherFactory(
  db: DbOrTx,
  deps: PublisherFactoryDeps,
): (kind: CalendarKind) => CalendarPublisher {
  const graph = createLazyGraphPublisher(db, { fetch: deps.fetch ?? fetch, now: deps.now })
  return (kind) => (kind === 'graph' ? graph : deps.ics)
}
