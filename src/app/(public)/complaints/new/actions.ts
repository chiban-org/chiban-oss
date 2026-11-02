'use server'

import { z } from 'zod'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { sanitizeImage } from '@/features/anonymousIntake/sanitizeImage'
import { parcelForLocation } from '@/features/enforcement/caseParcel'
import type { CleanPhoto } from '@/features/enforcement/complaintPhotos'
import { MAX_COMPLAINT_CHARS, recordComplaint } from '@/features/enforcement/complaints'
import { getObjectStore } from '@/features/storage/objectStore'
import { ACTION_FILES_LIMIT_MB, complaintPhotosProblem } from '@/lib/uploadLimits'
import { guardAction } from '@/server/actionGuard'
import type { ActionResult } from '@/server/actionRunner'

const MAX_PHOTOS = 5
const TIMEOUT_MS = 30_000

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().trim().max(max).optional(),
  )

const FieldsSchema = z.object({
  locationText: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(MAX_COMPLAINT_CHARS),
  name: optionalText(200),
  email: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.email().max(320).optional(),
  ),
  phone: optionalText(40),
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
  if (!guard.ok) return { ok: false, error: 'Your session expired. Reload the page and try again.' }
  const fields = FieldsSchema.safeParse({
    locationText: formData.get('locationText'),
    description: formData.get('description'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
  })
  if (!fields.success) {
    return {
      ok: false,
      error:
        'Enter the location and what you saw. If you give an email address, check that it is valid.',
    }
  }
  const photos = await cleanPhotos(formData)
  if (photos === null) {
    return {
      ok: false,
      error: `Attach no more than 5 photos, use JPEG or PNG files only, and keep them under ${ACTION_FILES_LIMIT_MB} MB in all.`,
    }
  }
  const v = fields.data
  const parcelId = await parcelForLocation(db, v.locationText, signal)
  const result = await recordComplaint(
    db,
    null,
    {
      channel: 'public_named',
      locationText: v.locationText,
      description: v.description,
      ...(v.name === undefined ? {} : { name: v.name }),
      ...(v.email === undefined ? {} : { email: v.email }),
      ...(v.phone === undefined ? {} : { phone: v.phone }),
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
