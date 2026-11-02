import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { handleWebhook } from '@/features/payments/handleWebhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 30_000

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
): Promise<NextResponse> {
  const { accountId } = await params
  const rawBody = await request.text()
  const result = await handleWebhook(
    db,
    { now: new Date() },
    { accountId, rawBody, headers: request.headers },
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  )
  return NextResponse.json(result.body, { status: result.status })
}
