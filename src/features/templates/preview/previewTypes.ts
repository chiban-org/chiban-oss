import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { DocumentInput } from '@/features/templates/templateBlocks'

export interface SampleRecord {
  id: string
  label: string
}

export interface PreviewScope {
  db: DbOrTx
  actor: Actor
  signal: AbortSignal
}

export interface PreviewSource {
  samples(scope: PreviewScope): Promise<SampleRecord[]>
  input(scope: PreviewScope, id: string): Promise<DocumentInput | null>
}

export const SAMPLE_LIMIT = 25

export const NO_PREVIEW: PreviewSource = {
  samples: () => Promise.resolve([]),
  input: () => Promise.resolve(null),
}
