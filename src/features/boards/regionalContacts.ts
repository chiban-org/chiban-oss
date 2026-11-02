import type { DbOrTx } from '@/db/client'
import {
  EMPTY_REGIONAL_CONTACTS,
  type RegionalContactsBody,
} from '@/features/boards/regionalContactsSchema'
import { getPublished } from '@/features/config/store'

export * from '@/features/boards/regionalContactsSchema'

export async function getRegionalContacts(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<RegionalContactsBody> {
  const published = await getPublished(db, 'regional_contacts', 'default', signal)
  return published === null ? EMPTY_REGIONAL_CONTACTS : (published.body as RegionalContactsBody)
}
