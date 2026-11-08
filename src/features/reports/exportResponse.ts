import type { ReportExport } from '@/features/reports/reportExport'
import { sheetCsv, sheetXlsx } from '@/features/reports/sheet'

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface ExportFile {
  filename: string
  contentType: string
  content: Buffer
}

export async function exportFile(format: ExportFormat, built: ReportExport): Promise<ExportFile> {
  if (format === 'csv') {
    return {
      filename: `${built.basename}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: Buffer.from(sheetCsv(built.rows), 'utf8'),
    }
  }
  return {
    filename: `${built.basename}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    content: await sheetXlsx({ title: built.title, rows: built.rows }),
  }
}

export async function exportResponse(
  format: ExportFormat,
  built: ReportExport,
  cacheControl = 'private, no-store',
): Promise<Response> {
  const file = await exportFile(format, built)
  return new Response(new Uint8Array(file.content), {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename="${file.filename}"`,
      'cache-control': cacheControl,
    },
  })
}
