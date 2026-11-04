import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { para } from '@/features/templates/doc/build'
import { defaultTemplateKey, documentKind } from '@/features/templates/kinds/documentKinds'
import type { TemplateKind } from '@/features/templates/templateSchema'
import { saveAndPublish } from '@/test/configFixtures'

export const TOWN_WORDING = 'Town wording check'

export async function publishWordingTemplate(
  db: Db,
  admin: Actor,
  kind: TemplateKind,
): Promise<void> {
  const key = defaultTemplateKey(kind)
  await saveAndPublish(db, admin, 'template', key, {
    key,
    label: documentKind(kind).label,
    kind,
    format: 'doc',
    doc: {
      type: 'doc',
      content: [para(TOWN_WORDING), ...documentKind(kind).defaultDoc.content],
    },
  })
}
