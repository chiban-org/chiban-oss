import { derivativeResponse } from '@/features/renditions/derivativeResponse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
): Promise<Response> {
  const { documentId } = await params
  return await derivativeResponse(documentId, 'thumbnail', 1)
}
