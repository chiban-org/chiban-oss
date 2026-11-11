import { EXPORT_ENTITIES } from '@/features/export/entities'
import { renderFormatDoc } from '@/features/export/formatDoc'
import { generatedFrontMatter } from '@/lib/generatedFrontMatter'

export const EXPORT_FORMAT_PAGE_PATH = 'docs-site/docs/reports-and-export/export-format.md'

export function renderFormatDocPage(): string {
  const frontMatter = generatedFrontMatter({
    sources: ['src/features/export/formatDoc.ts', 'src/features/export/entities.ts'],
    fields: { sidebar_label: 'Export archive format' },
  })
  return `${frontMatter}${renderFormatDoc(EXPORT_ENTITIES)}`
}
