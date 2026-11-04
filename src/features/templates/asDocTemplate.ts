import { textToDoc } from '@/features/templates/doc/textToDoc'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import {
  type DocTemplateBody,
  isDocTemplate,
  type TemplateBody,
} from '@/features/templates/templateSchema'

export function asDocTemplate(template: TemplateBody): DocTemplateBody {
  if (isDocTemplate(template)) return template
  const kind = documentKind(template.kind)
  return {
    key: template.key,
    label: template.label,
    kind: template.kind,
    format: 'doc',
    doc: textToDoc(template.body, {
      lockedSources: kind.locked,
      ...(kind.textSuffix === undefined ? {} : { suffix: kind.textSuffix }),
    }),
  }
}
