import type { BoardKind } from '@packs/nh/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { loadPack } from '@/features/packs/loadPack'

export function boardOfApplication(app: ApplicationContext): BoardKind | null {
  return (
    loadPack().classifications.find((c) => c.key === app.typeBody.classification)?.boardKind ?? null
  )
}

export function declaresSubstep(app: ApplicationContext, state: string, key: string): boolean {
  return app.typeBody.workflow.substeps.some((s) => s.state === state && s.key === key)
}
