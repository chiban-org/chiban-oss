import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export const MAX_DESCRIPTION_CHARS = 5000
export const MAX_PHOTOS = 5

export default function ReportAnonymouslyPage() {
  return (
    <>
      <h1>Report a possible violation anonymously</h1>
      <form
        method="post"
        action="/intake/anonymous"
        encType="multipart/form-data"
        className="mt-4 flex max-w-xl flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="location">Where is the property?</Label>
          <Input id="location" name="location" required maxLength={300} autoComplete="off" />
        </div>
        <p className="m-0 max-w-prose text-base">
          Anything you type or attach may identify you. Leave out your name, your address, and
          details only you would know. Photos are stripped of location and camera data before they
          are saved.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">What did you see?</Label>
          <Textarea
            id="description"
            name="description"
            required
            maxLength={MAX_DESCRIPTION_CHARS}
            rows={6}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="photos">Photos (up to 5, JPEG or PNG)</Label>
          <Input id="photos" name="photos" type="file" accept="image/jpeg,image/png" multiple />
        </div>
        <Button type="submit" size="lg" className="min-h-11 self-start text-base">
          Send report
        </Button>
      </form>
    </>
  )
}
