import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  search: string
  label: string
  carried: [string, string][]
}

export function ContactSearch({ search, label, carried }: Props) {
  return (
    <form
      method="get"
      role="search"
      aria-label="Search notice contacts"
      className="flex flex-wrap items-center gap-2 max-sm:w-full"
    >
      <Label htmlFor="notice-contacts-search" className="sr-only">
        {label}
      </Label>
      <Input
        id="notice-contacts-search"
        type="search"
        name="q"
        defaultValue={search}
        placeholder={label}
        className="w-72 max-sm:w-auto max-sm:flex-1"
      />
      {carried.map(([name, value]) => (
        <input key={`${name}=${value}`} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  )
}
