import type { ReactNode } from 'react'
import type { PublicTown } from '@/features/town/publicTown'

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

function Line({ show, children }: { show: boolean; children: ReactNode }) {
  return show ? <span className="block">{children}</span> : null
}

export function TownFooter({ town }: { town: PublicTown }) {
  const { office } = town
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-3 px-4 py-8">
        <p className="m-0 font-serif text-lg font-semibold text-ink">{town.name}</p>
        <address className="not-italic text-ink-secondary">
          <span className="block font-semibold text-ink">{office.officeName}</span>
          {office.addressLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
          <Line show={office.phone !== ''}>
            {'Phone '}
            <a href={telHref(office.phone)}>{office.phone}</a>
          </Line>
          <Line show={office.email !== ''}>
            {'Email '}
            <a href={`mailto:${office.email}`}>{office.email}</a>
          </Line>
          <Line show={office.officeHours !== ''}>{`Hours: ${office.officeHours}`}</Line>
        </address>
      </div>
    </footer>
  )
}
