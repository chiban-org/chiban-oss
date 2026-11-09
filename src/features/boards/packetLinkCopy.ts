import type { LinkRefusal } from '@/features/boards/packetLinks'
import type { CivilDate } from '@/types/civilDate'

export type ShownRefusal = Exclude<LinkRefusal, 'invalid'>

export interface RefusalCopy {
  heading: string
  body: string
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
})

function monthDay(date: CivilDate): string {
  return MONTH_DAY.format(new Date(`${date}T00:00:00Z`))
}

export function refusalCopy(refusal: ShownRefusal): RefusalCopy {
  if (refusal === 'expired') {
    return {
      heading: 'This link has expired',
      body: 'Private packet links stop working after a set number of days. Ask the land use office to send you a new one.',
    }
  }
  if (refusal === 'revoked') {
    return {
      heading: 'This link no longer works',
      body: 'The land use office turned this link off.',
    }
  }
  return {
    heading: 'This meeting was cancelled',
    body: `The ${monthDay(refusal.cancelled)} meeting was cancelled. Its packet is closed.`,
  }
}
