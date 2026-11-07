import { arrangePanels, type Panel } from '@/components/layout/splitPanels'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import {
  type CasePanelKey,
  caseHistoryPanels,
  casePanelPriority,
} from '@/features/enforcement/panelPriority'
import { AppealsSection } from './AppealsSection'
import { ComplaintsSection } from './ComplaintsSection'
import { CounselSection } from './CounselSection'
import type { Can } from './can'
import { DocumentsSection } from './DocumentsSection'
import { FindingsSection, NotesSection } from './FindingsSection'
import { MoneySection } from './MoneySection'
import { OrdersSection } from './OrdersSection'

export const READ_ONLY: Can = {
  manage: false,
  issue: false,
  service: false,
  counsel: false,
  fine: false,
  collect: false,
  publish: false,
  manageDocuments: false,
}

interface CasePanel extends Panel {
  key: CasePanelKey
}

export interface PanelInput {
  detail: CaseDetail
  can: Can
  hosted: ReadonlySet<string>
}

export function casePanels({ detail, can, hosted }: PanelInput): CasePanel[] {
  return [
    {
      key: 'complaints',
      empty: detail.staff.complaints.length === 0,
      node: <ComplaintsSection key="complaints" detail={detail} can={can} />,
    },
    {
      key: 'notes',
      empty: detail.staff.notes.length === 0,
      node: <NotesSection key="notes" detail={detail} can={can} />,
    },
    {
      key: 'findings',
      empty: detail.findings.length === 0 && detail.notices.length === 0,
      node: <FindingsSection key="findings" detail={detail} can={can} hosted={hosted} />,
    },
    {
      key: 'orders',
      empty: detail.orders.length === 0,
      node: <OrdersSection key="orders" detail={detail} can={can} hosted={hosted} />,
    },
    {
      key: 'appeals',
      empty: detail.appeals.length === 0,
      node: <AppealsSection key="appeals" detail={detail} can={can} />,
    },
    {
      key: 'fines',
      empty: detail.fines.length === 0 && detail.exposure === null,
      node: <MoneySection key="money" detail={detail} can={can} hosted={hosted} />,
    },
    {
      key: 'counsel',
      empty: detail.referrals.length === 0,
      node: <CounselSection key="counsel" detail={detail} can={can} />,
    },
    {
      key: 'documents',
      empty: detail.documents.length === 0,
      node: <DocumentsSection key="documents" detail={detail} can={can} />,
    },
  ]
}

export function readOnlyPanels(
  detail: CaseDetail,
  can: Can,
  { withService }: { withService: boolean },
): CasePanel[] {
  return casePanels({ detail, can: READ_ONLY, hosted: new Set() }).map((panel) => {
    if (panel.key === 'complaints') {
      return {
        ...panel,
        node: <ComplaintsSection key="complaints" detail={detail} can={can} readOnly />,
      }
    }
    if (panel.key === 'orders') {
      return {
        ...panel,
        node: (
          <OrdersSection key="orders" detail={detail} can={READ_ONLY} withService={withService} />
        ),
      }
    }
    return panel
  })
}

export function arrangeCasePanels(detail: CaseDetail, panels: readonly Panel[]) {
  const { status } = detail.staff.row
  const stayed = detail.stay.stayed
  return arrangePanels(panels, {
    lead: casePanelPriority(status, stayed),
    history: caseHistoryPanels(status, stayed),
  })
}
