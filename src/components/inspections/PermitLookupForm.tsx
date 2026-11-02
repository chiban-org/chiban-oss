import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PermitLookupForm({ number }: { number: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="permit-number" className="text-base">
          Permit number
        </Label>
        <Input
          id="permit-number"
          name="number"
          defaultValue={number}
          className="min-h-11 text-base md:text-base"
        />
      </div>
      <Button type="submit" variant="outline" className="min-h-11 text-base">
        Find permit
      </Button>
    </form>
  )
}
