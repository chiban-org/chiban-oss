import Link from 'next/link'
import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'

export interface FindContext {
  requestId: string
  find: string
  userId: string
  example: string | null
}

export function ReleaseFind({ requestId, find, userId, example }: FindContext) {
  const path = `/staff/records/requests/${requestId}`
  const query = find.trim()
  return (
    <div className="space-y-2">
      <form role="search" method="get" action={path} className="space-y-4">
        <TextField
          label="Find a document by title or application or case number"
          name="find"
          defaultValue={find}
        />
        <Button type="submit" variant="outline">
          Find
        </Button>
      </form>
      {example === null ? null : (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">Try</span>
          <Link href={`${path}?find=${encodeURIComponent(example)}`}>{example}</Link>
        </p>
      )}
      <RecentParcelSearches
        userId={userId}
        record={query === '' ? null : query}
        hrefBase={path}
        param="find"
        list="recentReleaseSearches"
      />
    </div>
  )
}
