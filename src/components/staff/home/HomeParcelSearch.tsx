import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'
import { SearchExamples } from '@/components/parcels/SearchExamples'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SearchExample } from '@/features/parcels/searchExample'

export function HomeParcelSearch({
  userId,
  example,
}: {
  userId: string
  example: SearchExample | null
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <form role="search" method="get" action="/staff/parcels" className="flex gap-3">
        <Label htmlFor="home-parcel-search" className="sr-only">
          Address, owner, or parcel ID
        </Label>
        <Input
          id="home-parcel-search"
          name="q"
          placeholder="Address, owner, or parcel ID"
          className="h-11 flex-1 text-base md:text-base"
        />
        <Button type="submit" size="lg" className="h-11 text-base">
          Find a parcel
        </Button>
      </form>
      <SearchExamples example={example} hrefBase="/staff/parcels" />
      <RecentParcelSearches userId={userId} record={null} hrefBase="/staff/parcels" />
    </div>
  )
}
