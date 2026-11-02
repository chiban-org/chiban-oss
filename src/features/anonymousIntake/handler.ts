import { z } from 'zod'
import { env } from '@/config/env'
import { ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { clientKey } from '@/features/anonymousIntake/clientKey'
import { intakeOpen } from '@/features/anonymousIntake/enablement'
import { isLiveProbeToken } from '@/features/anonymousIntake/probeToken'
import { type SanitizedType, sanitizeImage } from '@/features/anonymousIntake/sanitizeImage'
import { writeAudit } from '@/features/audit/writeAudit'
import { attachComplaintPhotos } from '@/features/enforcement/complaintPhotos'
import { insertComplaintWithCase, MAX_COMPLAINT_CHARS } from '@/features/enforcement/complaints'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { RateLimiter } from '@/server/rateLimiter'

export const MAX_PHOTOS = 5
const SAFE_HEADERS = { 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' } as const

export interface IntakeDeps {
  db: Db
  store: ObjectStore
  now(): Date
  limiter: RateLimiter
  imageRef: string | null
  appVersion: string
}

const FieldsSchema = z.object({
  location: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(MAX_COMPLAINT_CHARS),
})

function page(status: number, heading: string, text: string, extra: Record<string, string> = {}) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${heading}</title></head><body><main><h1>${heading}</h1><p>${text}</p></main></body></html>`
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...SAFE_HEADERS, ...extra },
  })
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if (origin === new URL(env.BASE_URL).origin) return site === null || site === 'same-origin'
  if (origin === 'null') return site === 'same-origin'
  return origin === null && (site === null || site === 'same-origin')
}

interface Parsed {
  location: string
  description: string
  photos: { bytes: Uint8Array; type: SanitizedType }[]
  probe: boolean
}

async function parse(request: Request, probe: boolean): Promise<Parsed | null> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return null
  }
  const fields = FieldsSchema.safeParse({
    location: form.get('location'),
    description: form.get('description'),
  })
  if (!fields.success) return null
  const files = form.getAll('photos').filter((v): v is File => v instanceof File && v.size > 0)
  if (files.length > MAX_PHOTOS || files.some((f) => f.size > env.MAX_UPLOAD_BYTES)) return null
  const photos: Parsed['photos'] = []
  for (const file of files) {
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const clean = await sanitizeImage(new Uint8Array(await file.arrayBuffer()), type)
    if (!clean.ok) return null
    photos.push({ bytes: clean.value.bytes, type: clean.value.contentType })
  }
  return { ...fields.data, photos, probe }
}

async function storeReport(deps: IntakeDeps, parsed: Parsed, signal: AbortSignal): Promise<string> {
  return await deps.db.transaction(async (tx) => {
    const created = await insertComplaintWithCase(
      tx,
      {
        channel: 'anonymous_web',
        locationText: parsed.location,
        description: parsed.description,
        isProbe: parsed.probe,
      },
      deps.now(),
      signal,
    )
    await attachComplaintPhotos(
      tx,
      deps.store,
      {
        caseId: created.caseId,
        photos: parsed.photos,
        actor: { kind: 'anonymous_public_intake' },
      },
      signal,
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'anonymous_public_intake' },
        action: 'enforcement.complaint_received',
        entityType: 'complaint',
        entityId: created.complaintId,
        after: { number: created.number, channel: 'anonymous_web', photos: parsed.photos.length },
      },
      signal,
    )
    return created.number
  })
}

async function processIntake(
  deps: IntakeDeps,
  request: Request,
  signal: AbortSignal,
): Promise<Response> {
  const probe = await isLiveProbeToken(
    deps.db,
    request.headers.get('x-chiban-probe'),
    deps.now(),
    signal,
  )
  if (!probe && !(await intakeOpen(deps.db, deps.imageRef, deps.appVersion, signal))) {
    return new Response('Not found', { status: 404, headers: SAFE_HEADERS })
  }
  if (!sameOrigin(request))
    return page(403, 'Not allowed', 'This form must be sent from this site.')
  deps.limiter.prune()
  const key = clientKey(request.headers.get('x-forwarded-for'))
  if (deps.limiter.isLimited(key)) {
    return page(
      429,
      'Too many reports',
      'Too many reports came from this connection. Try again later.',
    )
  }
  deps.limiter.recordFailure(key)
  const parsed = await parse(request, probe)
  if (parsed === null) {
    return page(
      400,
      'Report not sent',
      'Fill in the location and the description (up to 5,000 characters), and attach no more than 5 JPEG or PNG photos.',
    )
  }
  const number = await storeReport(deps, parsed, signal)
  return new Response(null, {
    status: 303,
    headers: { location: `/report-anonymously/received?ref=${number}`, ...SAFE_HEADERS },
  })
}

export async function handleAnonymousIntake(
  deps: IntakeDeps,
  request: Request,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await processIntake(deps, request, signal)
  } catch {
    process.stderr.write(`anonymous_intake_failed ${ErrorIds.ANON_INTAKE_FAILED}\n`)
    return page(
      500,
      'Report not sent',
      'Something went wrong and the report was not saved. Try again later.',
    )
  }
}
