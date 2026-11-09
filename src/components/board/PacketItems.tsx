import { NewTabLink } from '@/components/board/NewTabLink'
import { SectionHeader } from '@/components/layout/ListHeader'
import { COVER_GROUP, type PacketGroup, packetGroups } from '@/features/boards/packetGroups'
import type { PacketAgendaItem, PacketCaseItem, PacketViewItem } from '@/features/boards/packetView'
import { formatCivilDate } from '@/lib/formatDate'

const MARKS = { added: 'Added', replaced: 'Replaced' } as const

export function withdrawnText(item: PacketViewItem): string {
  if (item.withdrawnOn === null) return ''
  const date = formatCivilDate(item.withdrawnOn)
  if (item.withdrawnWhy === 'removed') return `removed from the packet by the town on ${date}`
  if (item.withdrawnWhy === 'disposed') {
    return `withdrawn by the town on ${date} under the records retention schedule`
  }
  return `withdrawn by the town on ${date} because its public copy was revoked`
}

export function Marker({ text }: { text: string }) {
  return <mark className="ml-2 rounded-sm bg-highlight px-1 text-ink">{text}</mark>
}

function Item({ item, base }: { item: PacketViewItem; base: string }) {
  if (item.withdrawnOn !== null) {
    return <span>{`${item.title}: ${withdrawnText(item)}`}</span>
  }
  return (
    <>
      <NewTabLink href={`${base}/${item.versionId}`}>{item.title}</NewTabLink>
      {item.mark === null ? null : <Marker text={MARKS[item.mark]} />}
    </>
  )
}

function Group({ group, base, id }: { group: PacketGroup; base: string; id: string }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{group.heading}</h3>
      {group.applicant === null ? null : (
        <p className="text-muted-foreground">{`Applicant: ${group.applicant}`}</p>
      )}
      <ul className="list-none space-y-1 p-0">
        {group.key === COVER_GROUP ? (
          <li>
            <NewTabLink href={`${base}/cover`}>Cover page and contents</NewTabLink>
          </li>
        ) : null}
        {group.items.map((item) => (
          <li key={item.versionId}>
            <Item item={item} base={base} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PacketContents({
  view,
  base,
}: {
  view: { agenda: readonly PacketAgendaItem[]; items: PacketCaseItem[] }
  base: string
}) {
  return (
    <section aria-label="In this packet">
      <SectionHeader title="In this packet" lead="Documents open in a new tab." />
      {packetGroups(view).map((group, index) => (
        <Group key={group.key} group={group} base={base} id={`packet-group-${index + 1}`} />
      ))}
    </section>
  )
}
