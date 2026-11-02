import type { Board } from '@packs/nh/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { loadPack } from '@/features/packs/loadPack'

export function boardOfApplication(app: ApplicationContext): Board | null {
  return (
    loadPack().classifications.find((c) => c.key === app.typeBody.classification)?.board ?? null
  )
}

export function declaresSubstep(app: ApplicationContext, state: string, key: string): boolean {
  return app.typeBody.workflow.substeps.some((s) => s.state === state && s.key === key)
}
