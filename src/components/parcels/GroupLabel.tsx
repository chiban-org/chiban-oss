import Link from 'next/link'

export interface LabeledGroup {
  parcelId: string
  displayId: string
  label: string
}

export function GroupLabel({ group, hrefBase }: { group: LabeledGroup; hrefBase: string }) {
  const at = group.displayId === '' ? -1 : group.label.indexOf(group.displayId)
  if (at === -1) return group.label
  return (
    <>
      {group.label.slice(0, at)}
      <Link href={`${hrefBase}${group.parcelId}`} className="tap-target">
        {group.displayId}
      </Link>
      {group.label.slice(at + group.displayId.length)}
    </>
  )
}
