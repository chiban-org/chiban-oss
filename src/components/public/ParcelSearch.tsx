import { SearchExamples } from '@/components/parcels/SearchExamples'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SearchExample } from '@/features/parcels/searchExample'

export function ParcelSearch({
  defaultValue = '',
  example,
}: {
  defaultValue?: string
  example: SearchExample | null
}) {
  return (
    <form method="get" action="/parcels" role="search" className="flex flex-col gap-2">
      <Label htmlFor="parcel-search" className="text-base font-semibold">
        Find a parcel by ID, address, or owner
      </Label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          id="parcel-search"
          name="q"
          defaultValue={defaultValue}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 text-base md:text-base"
        />
        <Button type="submit" size="lg" className="h-11 text-base font-semibold sm:self-start">
          Search
        </Button>
      </div>
      <SearchExamples example={example} hrefBase="/parcels" />
    </form>
  )
}
