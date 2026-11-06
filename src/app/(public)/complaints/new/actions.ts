'use server'

import { z } from 'zod'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { sanitizeImage } from '@/features/anonymousIntake/sanitizeImage'
import { parcelForLocation } from '@/features/enforcement/caseParcel'
import type { CleanPhoto } from '@/features/enforcement/complaintPhotos'
import { MAX_COMPLAINT_CHARS, recordComplaint } from '@/features/enforcement/complaints'
import { optionalEmail } from '@/features/input/optionalEmail'
import { optionalPhone, optionalText, requiredText } from '@/features/input/schemas'
import { getObjectStore } from '@/features/storage/objectStore'
import { ACTION_FILES_LIMIT_MB, complaintPhotosProblem } from '@/lib/uploadLimits'
import { guardAction } from '@/server/actionGuard'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { parseForm, refuseField } from '@/server/formInput'

const MAX_PHOTOS = 5
const TIMEOUT_MS = 30_000

const FieldsSchema = z.object({
  locationText: requiredText('where the property is', { max: 300 }),
  description: requiredText('what you saw', { max: MAX_COMPLAINT_CHARS }),
  name: optionalText('your name', { max: 200 }),
  email: optionalEmail('your email'),
  phone: optionalPhone('your phone'),
})

async function cleanPhotos(formData: FormData): Promise<CleanPhoto[] | null> {
  const files = formData.getAll('photos').filter((v): v is File => v instanceof File && v.size > 0)
  if (files.length > MAX_PHOTOS || files.some((f) => f.size > env.MAX_UPLOAD_BYTES)) return null
  if (complaintPhotosProblem(files.map((f) => f.size)) !== null) return null
  const out: CleanPhoto[] = []
  for (const file of files) {
    const declared = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const clean = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), declared)
    if (!clean.ok) return null
    out.push({ bytes: clean.value.bytes, type: clean.value.contentType })
  }
  return out
}

export async function submitComplaintAction(formData: FormData): Promise<ActionResult> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) return { ok: false, error: errorCopy(guard.error) }
  const fields = parseForm(FieldsSchema, formData)
  if (!fields.ok) return fields.error
  const photos = await cleanPhotos(formData)
  if (photos === null) {
    return refuseField(
      'photos',
      `Attach no more than 5 photos, use JPEG or PNG files only, and keep them under ${ACTION_FILES_LIMIT_MB} MB in all.`,
    )
  }
  const v = fields.value
  const parcelId = await parcelForLocation(db, v.locationText, signal)
  const result = await recordComplaint(
    db,
    null,
    {
      channel: 'public_named',
      locationText: v.locationText,
      description: v.description,
      ...(v.name === null ? {} : { name: v.name }),
      ...(v.email === null ? {} : { email: v.email }),
      ...(v.phone === null ? {} : { phone: v.phone }),
      ...(parcelId === undefined ? {} : { parcelId }),
    },
    signal,
    new Date(),
    { store: getObjectStore(), photos },
  )
  if (!result.ok) return { ok: false, error: 'The complaint could not be saved. Try again.' }
  return {
    ok: true,
    message: `Complaint received. Reference ${result.value.number}. Town staff will review it.`,
  }
}
