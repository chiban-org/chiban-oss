import { writeFile } from 'node:fs/promises'
import { EXPORT_FORMAT_PAGE_PATH, renderFormatDocPage } from '@/features/export/formatDocPage'

const target = process.argv[2] ?? EXPORT_FORMAT_PAGE_PATH
await writeFile(target, renderFormatDocPage(), 'utf8')
