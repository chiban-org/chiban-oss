import { derivativeResponse } from '@/features/renditions/derivativeResponse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE = /^[1-9][0-9]{0,2}$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string; page: string }> },
): Promise<Response> {
  const { documentId, page } = await params
  if (!PAGE.test(page))
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  return await derivativeResponse(documentId, 'preview', Number(page))
}
