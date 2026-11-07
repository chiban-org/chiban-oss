import type { InspectionStep } from '@/features/applications/workPlanTypes'
import type { InspectionHistoryRow } from '@/features/inspections/history'
import { type InspectionView, loadInspectionView } from '@/features/inspections/inspectionView'
import {
  dueFor,
  inspectionName,
  inspectorSentence,
  slotText,
} from '@/features/inspections/inspectorFocus'
import type { StaffContext } from '@/server/requireStaff'
import type { InspectionsPanelData } from './inspectionsPanel'

export interface DueInspection {
  view: InspectionView
  row: InspectionHistoryRow
  data: InspectionsPanelData
  step: InspectionStep
}

export async function loadDueInspection(
  ctx: StaffContext,
  data: InspectionsPanelData,
): Promise<DueInspection | null> {
  const viewerId = ctx.actor.userId
  const row = dueFor(data.history, viewerId, data.today)
  if (row === null) return null
  const loaded = await loadInspectionView(ctx.db, ctx.actor, row.id, ctx.signal)
  if (!loaded.ok || !loaded.value.canRecord) return null
  return {
    view: loaded.value,
    row,
    data,
    step: {
      task: inspectionName(row),
      note: slotText(row, data.today),
      sentence: inspectorSentence({
        rows: [row],
        today: data.today,
        viewerId,
        inspectorName: null,
      }),
    },
  }
}
