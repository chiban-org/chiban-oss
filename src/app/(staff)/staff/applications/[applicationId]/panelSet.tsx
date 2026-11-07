import { arrangePanels } from '@/components/layout/splitPanels'
import { historyPanels, panelPriority } from '@/features/applications/panelPriority'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { PlanActionKind } from '@/features/applications/workPlanTypes'
import type { BoardPanelData } from '@/features/boards/panelData'
import type { ApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import type { DueInspection } from './dueInspection'
import type { InspectionsPanelData } from './inspectionsPanel'
import type { NotesData } from './notesData'
import { recordPanels } from './recordPanelList'
import type { loadRecordsData } from './recordsData'
import { workPanels } from './workPanels'

export interface RecordPanelsInput {
  view: StaffApplicationView
  records: Awaited<ReturnType<typeof loadRecordsData>>
  payments: ApplicationPayments | null
  inspections: InspectionsPanelData
  board: BoardPanelData | null
  hearings: ApplicationHearingsPanel | null
  notes: NotesData
  hosted?: ReadonlySet<PlanActionKind>
  due?: DueInspection | null
}

export function applicationPanels(input: RecordPanelsInput) {
  const { state } = input.view
  const board = input.board !== null
  return arrangePanels([...workPanels(input), ...recordPanels(input)], {
    lead: panelPriority(state, board),
    history: historyPanels(state, board),
  })
}
