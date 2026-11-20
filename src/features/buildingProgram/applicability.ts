import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { getBuildingProgram } from '@/features/buildingProgram/settings'
import { activePack } from '@/features/packs/registry'

export type Applicability = { codeChoice: string | null }

export async function captureApplicability(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<void> {
  const program = await getBuildingProgram(tx, signal)
  const applicability: Applicability = { codeChoice: program.codeChoice }
  await tx.update(applications).set({ applicability }).where(eq(applications.id, applicationId))
}

export function applicabilityOf(app: Pick<ApplicationContext, 'applicability'>): Applicability {
  return app.applicability ?? { codeChoice: activePack().buildingCodes.defaultChoice }
}
