import { writeFile } from 'node:fs/promises'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { renderFormatDoc } from '@/features/export/formatDoc'

const target = process.argv[2] ?? 'docs/export-format.md'
await writeFile(target, renderFormatDoc(EXPORT_ENTITIES), 'utf8')
