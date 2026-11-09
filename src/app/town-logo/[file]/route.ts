import { db } from '@/db/client'
import { getObjectStore } from '@/features/storage/objectStore'
import { townLogoResponse } from '@/features/town/townLogoResponse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params
  return await townLogoResponse(db, getObjectStore(), file, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
}
