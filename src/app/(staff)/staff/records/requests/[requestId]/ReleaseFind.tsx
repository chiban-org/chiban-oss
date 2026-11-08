import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import type { ReleaseCandidate } from '@/features/rtk/requestPage'
import { FindCount } from './FindCount'
import { FindResults } from './FindResults'

export interface FindContext {
  requestId: string
  find: string
  userId: string
  timeZone: string
  canRedact: boolean
}

export function ReleaseFind({
  context,
  candidates,
}: {
  context: FindContext
  candidates: readonly ReleaseCandidate[]
}) {
  const path = `/staff/records/requests/${context.requestId}`
  const query = context.find.trim()
  return (
    <div data-slot="release-find" id="release-find" className="flex flex-col gap-3">
      <form role="search" method="get" action={path} className="flex flex-col gap-3">
        <TextField
          label="Find a document by title or application or case number"
          name="find"
          defaultValue={context.find}
        />
        <Button type="submit" variant="outline" className="self-start">
          Find
        </Button>
      </form>
      <RecentParcelSearches
        userId={context.userId}
        record={query === '' ? null : query}
        hrefBase={path}
        param="find"
        list={`recentReleaseSearches.${context.requestId}`}
      />
      <FindCount query={query} count={candidates.length} />
      <FindResults context={context} candidates={candidates} />
    </div>
  )
}
