import { derivativeResponse } from '@/features/renditions/derivativeResponse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const { documentId } = await params
  const asPublic = new URL(request.url).searchParams.get('as') === 'public'
  return await derivativeResponse(documentId, 'thumbnail', 1, { asPublic })
}
