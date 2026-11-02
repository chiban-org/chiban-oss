import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { processUpload, UPLOAD_LIMIT_BYTES } from '@/features/gis/uploadImport'
import { guardAction } from '@/server/actionGuard'
import { staffActorOrNull } from '@/server/requireStaff'

export const runtime = 'nodejs'

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const FORM_OVERHEAD_BYTES = 1024 * 1024

export async function POST(request: Request): Promise<NextResponse> {
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > UPLOAD_LIMIT_BYTES + FORM_OVERHEAD_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 })
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const guard = await guardAction(form, signal)
  if (!guard.ok) return NextResponse.json({ error: 'csrf' }, { status: 403 })
  const actor = await staffActorOrNull(signal)
  if (actor === null) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const response = await processUpload(db, actor, form, signal)
  return NextResponse.json(response.body, { status: response.status })
}
