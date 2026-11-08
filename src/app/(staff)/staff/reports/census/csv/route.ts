import { censusExport } from '../../exportHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = censusExport('csv')
