import { cashReceiptsExport } from '../../exportHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = cashReceiptsExport('xlsx')
