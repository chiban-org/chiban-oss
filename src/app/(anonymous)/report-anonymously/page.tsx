import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { FilePicker } from '@/components/ui/file-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark, RequiredNote } from '@/components/ui/required-mark'
import { Textarea } from '@/components/ui/textarea'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { intakeOpen } from '@/features/anonymousIntake/enablement'

export const metadata: Metadata = { title: 'Report a possible violation anonymously' }

export const MAX_DESCRIPTION_CHARS = 5000
export const MAX_PHOTOS = 5

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000

export default async function ReportAnonymouslyPage() {
  const open = await intakeOpen(
    db,
    env.CHIBAN_IMAGE_REF ?? null,
    APP_VERSION,
    AbortSignal.timeout(TIMEOUT_MS),
  )
  if (!open) {
    return (
      <>
        <h1>Anonymous reports are not available</h1>
        <p className="max-w-prose text-base">
          This town is not taking anonymous reports right now. You can report a possible violation
          with your contact details, which only town staff see, on the{' '}
          <a href="/complaints/new">report a possible violation</a> page.
        </p>
      </>
    )
  }
  return (
    <>
      <h1>Report a possible violation anonymously</h1>
      <form
        method="post"
        action="/intake/anonymous"
        encType="multipart/form-data"
        className="mt-4 flex max-w-xl flex-col gap-5"
      >
        <RequiredNote />
        <div className="flex flex-col gap-2">
          <Label htmlFor="location">
            <span>
              Where is the property?
              <RequiredMark />
            </span>
          </Label>
          <Input id="location" name="location" required maxLength={300} autoComplete="off" />
        </div>
        <p className="m-0 max-w-prose text-base">
          Anything you type or attach may identify you. Leave out your name, your address, and
          details only you would know. Photos are stripped of location and camera data before they
          are saved.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">
            <span>
              What did you see?
              <RequiredMark />
            </span>
          </Label>
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
          <FilePicker id="photos" name="photos" accept="image/jpeg,image/png" multiple />
        </div>
        <Button type="submit" size="lg" className="min-h-11 self-start text-base">
          Send report
        </Button>
      </form>
    </>
  )
}
