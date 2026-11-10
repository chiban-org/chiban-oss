'use server'

import { hasCapability } from '@/features/authz/capabilities'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { getObjectStore } from '@/features/storage/objectStore'
import type { TownImage } from '@/features/town/profileSchema'
import { isTownProfileSection, publishTownProfileSection } from '@/features/town/profileSettings'
import {
  storeTownImage,
  TOWN_IMAGE_MAX_BYTES,
  type TownImageError,
} from '@/features/town/townImages'
import { type ActionResult, errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm, refuseField, runStaffForm } from '@/server/formInput'
import { TOWN_IMAGE_FORM, TOWN_SECTION_FORM } from '../forms'

export type UploadImageResult = { ok: true; image: TownImage } | { ok: false; error: string }

const IMAGE_ERRORS: Record<TownImageError, string> = {
  too_large: 'The image is larger than 2 MB. Choose a smaller file.',
  wrong_type: 'Choose a PNG or JPEG image.',
  unreadable: 'That image could not be read. Save it again as PNG or JPEG and try again.',
}

export async function publishTownSectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    TOWN_SECTION_FORM,
    async ({ db, actor, signal }, input) => {
      if (!isTownProfileSection(input.section)) return refuseField('section', 'Choose a section.')
      const result = await publishTownProfileSection(
        db,
        actor,
        { section: input.section, slice: input.body },
        signal,
      )
      if (result.ok) return { ok: true, message: `Put version ${result.value.version} into use.` }
      if (result.error === 'forbidden') return { ok: false, error: errorCopy('forbidden') }
      return {
        ok: false,
        error: 'These settings cannot be put into use yet.',
        fieldErrors: fieldErrorsFor(result.error),
      }
    },
    { lockedInDemo: true },
  )
}

export async function uploadTownImageAction(formData: FormData): Promise<UploadImageResult> {
  return await runStaffValue<UploadImageResult>(
    formData,
    (error) => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      if (!(await hasCapability(db, actor.userId, 'config.edit', signal))) {
        return { ok: false, error: errorCopy('forbidden') }
      }
      const parsed = parseForm(TOWN_IMAGE_FORM, formData)
      if (!parsed.ok) return { ok: false, error: parsed.error.error }
      const { file } = parsed.value
      if (file.size > TOWN_IMAGE_MAX_BYTES) return { ok: false, error: IMAGE_ERRORS.too_large }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const stored = await storeTownImage(getObjectStore(), bytes, signal)
      return stored.ok
        ? { ok: true, image: stored.value }
        : { ok: false, error: IMAGE_ERRORS[stored.error] }
    },
    { lockedInDemo: true },
  )
}
