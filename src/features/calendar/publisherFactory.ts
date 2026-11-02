import type { DbOrTx } from '@/db/client'
import type { CalendarKind } from '@/db/schema'
import type { CalendarPublisher } from '@/features/calendar/publisher'

export interface PublisherFactoryDeps {
  ics: CalendarPublisher
  now: () => Date
}

export function createPublisherFactory(
  _db: DbOrTx,
  deps: PublisherFactoryDeps,
): (kind: CalendarKind) => CalendarPublisher {
  return (_kind) => deps.ics
}
