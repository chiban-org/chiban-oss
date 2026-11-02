import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import type { ConfigPins } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import type { ChecklistBody } from '@/features/inspections/checklistSchema'

export async function checklistItems(
  db: DbOrTx,
  applicationId: string,
  inspectionType: string,
  signal: AbortSignal,
): Promise<{ checklistVersionId: string; items: ChecklistBody['items'] }> {
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId))
  for (const id of (app?.configPins as ConfigPins | undefined)?.checklists ?? []) {
    const version = await getVersion(db, id, signal)
    const body = version?.body as ChecklistBody | undefined
    if (body?.inspectionType === inspectionType)
      return { checklistVersionId: id, items: body.items }
  }
  throw new AppError(ErrorIds.DB_INVARIANT, 'no checklist is pinned', { inspectionType })
}
