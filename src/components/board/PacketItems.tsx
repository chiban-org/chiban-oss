import Link from 'next/link'
import { NEW_TAB } from '@/components/newTab'
import type { PacketViewItem } from '@/features/boards/packetView'
import { formatCivilDate } from '@/lib/formatDate'

const LINK = 'tap-target inline-flex items-center'

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

export function PacketItems({ items, base }: { items: PacketViewItem[]; base: string }) {
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      <li>
        <Link {...NEW_TAB} href={`${base}/cover`} className={LINK}>
          Cover page and contents
        </Link>
      </li>
      {items.map((item) => (
        <li key={item.versionId}>
          {item.withdrawnOn === null ? (
            <>
              <Link {...NEW_TAB} href={`${base}/${item.versionId}`} className={LINK}>
                {item.title}
              </Link>
              {item.mark === null ? null : <Marker text={MARKS[item.mark]} />}
            </>
          ) : (
            <span>{`${item.title}: ${withdrawnText(item)}`}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
