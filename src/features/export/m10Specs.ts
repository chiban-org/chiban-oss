import * as t from '@/db/schema'
import type { Spec } from '@/features/export/entities'

export const M10_SPECS: Spec[] = [
  { table: t.rtkRequests },
  { table: t.rtkTimeStatements },
  { table: t.rtkWithholdings },
  { table: t.redactionJobs },
  { table: t.redactionBoxes },
  { table: t.renditionApprovals },
]
