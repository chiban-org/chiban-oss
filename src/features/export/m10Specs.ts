import * as t from '@/db/schema'
import type { Spec } from '@/features/export/entities'

const RANDOM_HASH = `encode(gen_random_bytes(32), 'hex')`

export const M10_SPECS: Spec[] = [
  { table: t.rtkRequests },
  { table: t.rtkTimeStatements },
  { table: t.rtkWithholdings },
  { table: t.redactionJobs },
  { table: t.redactionBoxes },
  { table: t.renditionApprovals },
  { table: t.rtkReleases, omit: ['link_token_hash'], fill: { link_token_hash: RANDOM_HASH } },
  { table: t.rtkReleaseItems },
]
