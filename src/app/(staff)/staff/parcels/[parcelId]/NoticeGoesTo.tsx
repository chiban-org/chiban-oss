import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  AddAssociation,
  EditAssociation,
} from '@/app/(staff)/staff/notice-contacts/AssociationForms'
import { EditHolder } from '@/app/(staff)/staff/notice-contacts/HolderForms'
import { EditPark } from '@/app/(staff)/staff/notice-contacts/ParkForms'
import { PersonLines } from '@/app/(staff)/staff/notice-contacts/RowParts'
import type { Panel } from '@/components/layout/splitPanels'
import { StatusChip } from '@/components/StatusChip'
import type { PickedParcel } from '@/features/parcels/parcelPick'
import { NOTICE_CONTACTS_PATH } from '@/features/rosters/links'
import type { ParcelContacts } from '@/features/rosters/parcelContacts'

function Entry({
  title,
  due,
  edit,
  children,
}: {
  title: string
  due: boolean
  edit: ReactNode
  children: ReactNode
}) {
  return (
    <div className="record-item space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0">{title}</h3>
        <div className="flex items-center gap-2">
          {due ? <StatusChip status="overdue" label="Due for a check" /> : null}
          {edit}
        </div>
      </div>
      {children}
    </div>
  )
}

export function NoticeGoesTo({
  contacts,
  parcel,
}: {
  contacts: ParcelContacts
  parcel: PickedParcel
}) {
  return (
    <section aria-labelledby="notice-goes-to">
      <h2 id="notice-goes-to">Notice goes to</h2>
      {contacts.empty ? <p>Notices for this parcel go to the owner of record.</p> : null}
      {contacts.missingAssociation === null ? null : (
        <div className="record-item flex flex-wrap items-center gap-3">
          <p className="m-0">
            {`This parcel has ${contacts.missingAssociation.units} units and no association on file, so a list that touches it cannot be issued.`}
          </p>
          <AddAssociation today={contacts.today} parcel={parcel} />
        </div>
      )}
      {contacts.associations.map((a) => (
        <Entry
          key={a.entryId}
          title={`Association officers, ${a.name}`}
          due={a.due}
          edit={<EditAssociation row={a} today={contacts.today} />}
        >
          <PersonLines
            people={a.officers.map((o, i) => ({ key: `${i}`, ...o, middle: o.title }))}
          />
        </Entry>
      ))}
      {contacts.parks.map((p) => (
        <Entry
          key={p.entryId}
          title={`Park owner and tenants, ${p.name}`}
          due={p.due}
          edit={<EditPark row={p} today={contacts.today} />}
        >
          <PersonLines
            people={[
              {
                key: 'owner',
                name: p.owner,
                middle: 'owner',
                mailingAddress: p.ownerMailingAddress,
              },
              ...p.tenants.map((t) => ({ key: t.tenantId, ...t, middle: t.siteLabel })),
            ]}
          />
        </Entry>
      ))}
      {contacts.restrictions.map((r) => (
        <Entry
          key={r.entryId}
          title={`Restriction holder, ${r.kindText}`}
          due={r.due}
          edit={<EditHolder row={r} />}
        >
          <PersonLines
            people={[
              { key: 'holder', name: r.holder, middle: '', mailingAddress: r.holderMailingAddress },
            ]}
          />
        </Entry>
      ))}
      <p>
        <Link href={NOTICE_CONTACTS_PATH}>All notice contacts</Link>
      </p>
    </section>
  )
}

export function noticePanel(
  contacts: ParcelContacts | null,
  parcel: Omit<PickedParcel, 'siteAddress' | 'ownerName'> & {
    siteAddress: { state: string; value?: unknown }
  },
): Panel {
  if (contacts === null) return { empty: true, node: null }
  const address = parcel.siteAddress.value
  return {
    empty: contacts.empty,
    node: (
      <NoticeGoesTo
        key="notice"
        contacts={contacts}
        parcel={{
          ...parcel,
          siteAddress: typeof address === 'string' ? address : null,
          ownerName: null,
        }}
      />
    ),
  }
}
