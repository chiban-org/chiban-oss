import { DocumentPanel } from '@/components/documents/DocumentPanel'
import { FactList } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { ParcelRecordsPanel } from '@/components/parcels/ParcelRecordsPanel'
import { isInForce } from '@/features/parcels/openGroups'
import type { OpenItem } from '@/features/parcels/openNow'
import { PANEL_ACTIONS } from '../../records/panelActions'
import { ConditionsInForce } from './ConditionsInForce'
import { FieldNextInspection } from './LotInspection'
import { OpenList } from './OpenOnLot'
import { ParcelIds } from './ParcelIds'
import { ParcelMapPanel } from './ParcelMapPanel'
import { parcelFacts } from './ParcelRail'
import type { ParcelPageData } from './parcelPageData'

function ItemsPanel({
  id,
  title,
  empty,
  items,
}: {
  id: string
  title: string
  empty: string
  items: readonly OpenItem[]
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {items.length === 0 ? <p>{empty}</p> : <OpenList items={items} label={title} />}
    </section>
  )
}

function FieldHistory({ data }: { data: ParcelPageData }) {
  return (
    <details data-history-group="" className="record-history">
      <summary>Record and history</summary>
      <ParcelRecordsPanel records={data.records} parcelHrefBase="/staff/parcels/" />
      {data.documents.length === 0 ? null : (
        <DocumentPanel
          documents={data.documents}
          canPublish={false}
          canManage={false}
          actions={PANEL_ACTIONS}
          target={{ kind: 'parcel', id: data.parcelId }}
        />
      )}
    </details>
  )
}

function FieldFacts({ data }: { data: ParcelPageData }) {
  return (
    <details data-parcel-facts="" className="record-history">
      <summary>Parcel facts</summary>
      <section aria-label="Parcel facts" data-plain>
        <FactList stacked facts={parcelFacts(data)} />
      </section>
      <ParcelIds aliases={data.view.aliases} displayId={data.displayId} canManage={false} />
    </details>
  )
}

export function FieldParcel({ data }: { data: ParcelPageData }) {
  return (
    <RecordLayout>
      <FieldNextInspection data={data} />
      <ItemsPanel
        id="open-cases"
        title="Open enforcement cases"
        empty="No enforcement case is open on this lot."
        items={data.items.filter((i) => i.group === 'case')}
      />
      <ConditionsInForce decisions={data.conditions} rows={data.rows} />
      <ItemsPanel
        id="in-force"
        title="Permits and approvals in force"
        empty="No permit or board approval is in force on this lot."
        items={data.items.filter((i) => isInForce(i.group))}
      />
      <ParcelMapPanel data={data} />
      <FieldHistory data={data} />
      <FieldFacts data={data} />
    </RecordLayout>
  )
}
