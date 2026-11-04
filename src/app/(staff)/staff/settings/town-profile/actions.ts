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
import {
  type ActionResult,
  errorCopy,
  runStaffAction,
  runStaffValue,
  text,
} from '@/server/actionRunner'

export type UploadImageResult = { ok: true; image: TownImage } | { ok: false; error: string }

const IMAGE_ERRORS: Record<TownImageError, string> = {
  too_large: 'The image is larger than 2 MB. Choose a smaller file.',
  wrong_type: 'Choose a PNG or JPEG image.',
  unreadable: 'That image could not be read. Save it again as PNG or JPEG and try again.',
}

function parseBody(formData: FormData): unknown {
  try {
    return JSON.parse(text(formData, 'body')) as unknown
  } catch {
    return undefined
  }
}

export async function publishTownSectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const section = text(formData, 'section')
    const slice = parseBody(formData)
    if (!isTownProfileSection(section) || slice === undefined) {
      return { ok: false, error: errorCopy('invalid_input') }
    }
    const result = await publishTownProfileSection(db, actor, { section, slice }, signal)
    if (result.ok) return { ok: true, message: `Published version ${result.value.version}.` }
    if (result.error === 'forbidden') return { ok: false, error: errorCopy('forbidden') }
    return {
      ok: false,
      error: 'These settings cannot be published yet.',
      fieldErrors: fieldErrorsFor(result.error),
    }
  })
}

export async function uploadTownImageAction(formData: FormData): Promise<UploadImageResult> {
  return await runStaffValue<UploadImageResult>(
    formData,
    (error) => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      if (!(await hasCapability(db, actor.userId, 'config.edit', signal))) {
        return { ok: false, error: errorCopy('forbidden') }
      }
      const file = formData.get('file')
      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: 'Choose an image to upload.' }
      }
      if (file.size > TOWN_IMAGE_MAX_BYTES) return { ok: false, error: IMAGE_ERRORS.too_large }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const stored = await storeTownImage(getObjectStore(), bytes, signal)
      return stored.ok
        ? { ok: true, image: stored.value }
        : { ok: false, error: IMAGE_ERRORS[stored.error] }
    },
  )
}
