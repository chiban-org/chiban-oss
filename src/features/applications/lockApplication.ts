import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications } from '@/db/schema'

export async function lockApplication(tx: Tx, applicationId: string): Promise<void> {
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update')
}
