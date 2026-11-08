import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ContractorSearch({ q }: { q: string }) {
  return (
    <form method="get" role="search" aria-label="Search contractors" className="max-sm:w-full">
      <Label htmlFor="contractors-search" className="sr-only">
        Search by company, contact, email, or license number
      </Label>
      <Input
        id="contractors-search"
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search by company, contact, email, or license number"
        className="w-96 max-sm:w-full"
      />
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  )
}
