import { ActionForm } from '@/components/ActionForm'
import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { ParcelFileUploader } from '@/components/documents/ParcelFileUploader'
import { arrangePanels, type Panel } from '@/components/layout/splitPanels'
import { ParcelRecordsPanel } from '@/components/parcels/ParcelRecordsPanel'
import { PANEL_ACTIONS } from '../../records/panelActions'
import {
  createStaffUploadIntentAction,
  finalizeStaffUploadAction,
} from '../../records/uploadActions'
import { carryForwardAction } from './actions'
import { ConditionsInForce } from './ConditionsInForce'
import { LineagePanel, lineageOf } from './LineagePanel'
import { noticePanel } from './NoticeGoesTo'
import { OpenOnLot, openPanelIsEmpty } from './OpenOnLot'
import { ParcelIds } from './ParcelIds'
import { ParcelMapPanel } from './ParcelMapPanel'
import type { ParcelPageData } from './parcelPageData'

export const OFFICE_ARRANGEMENT = {
  lead: ['open', 'map', 'conditions', 'records', 'documents', 'notice'],
  history: ['ids', 'lineage'],
} as const

function recordsPanel(data: ParcelPageData): Panel {
  return {
    key: 'records',
    empty: data.records.total === 0,
    node: (
      <ParcelRecordsPanel
        key="records"
        records={data.records}
        parcelHrefBase="/staff/parcels/"
        renderAction={(record) =>
          record.linkId === undefined || !data.can.manageParcel ? null : (
            <ActionForm
              action={carryForwardAction}
              submitLabel="Carry forward to this parcel"
              variant="outline"
            >
              <input type="hidden" name="linkId" value={record.linkId} />
              <input type="hidden" name="toParcelId" value={data.parcelId} />
            </ActionForm>
          )
        }
      />
    ),
  }
}

function documentsPanel(data: ParcelPageData): Panel {
  return {
    key: 'documents',
    empty: data.documents.length === 0,
    node: (
      <DocumentPanel
        key="documents"
        documents={data.documents}
        canPublish={data.can.publish}
        canManage={data.can.manageDocuments}
        actions={PANEL_ACTIONS}
        target={{ kind: 'parcel', id: data.parcelId }}
      >
        {data.can.manageDocuments ? (
          <details>
            <summary>Add a parcel file</summary>
            <ParcelFileUploader
              parcelId={data.parcelId}
              series={data.series}
              actions={{
                createIntent: createStaffUploadIntentAction,
                finalize: finalizeStaffUploadAction,
              }}
            />
          </details>
        ) : null}
      </DocumentPanel>
    ),
  }
}

export function officePanels(data: ParcelPageData) {
  const lineage = lineageOf(data.view)
  const notice = noticePanel(data.contacts, {
    parcelId: data.parcelId,
    displayId: data.displayId,
    status: data.view.status,
    siteAddress: data.view.siteAddress,
  })
  return arrangePanels(
    [
      { key: 'open', empty: openPanelIsEmpty(data), node: <OpenOnLot key="open" data={data} /> },
      { key: 'map', empty: false, node: <ParcelMapPanel key="map" data={data} /> },
      {
        key: 'conditions',
        empty: data.conditions.length === 0,
        node: <ConditionsInForce key="conditions" decisions={data.conditions} rows={data.rows} />,
      },
      recordsPanel(data),
      documentsPanel(data),
      { ...notice, key: 'notice' },
      {
        key: 'ids',
        empty: false,
        node: (
          <ParcelIds
            key="ids"
            aliases={data.view.aliases}
            displayId={data.displayId}
            canManage={data.can.manageParcel}
          />
        ),
      },
      {
        key: 'lineage',
        empty: lineage.length === 0,
        node: <LineagePanel key="lineage" lineage={lineage} />,
      },
    ],
    OFFICE_ARRANGEMENT,
  )
}
