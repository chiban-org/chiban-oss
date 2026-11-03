import Link from 'next/link'

export interface WayOut {
  href: string
  label: string
}

const START_PAGE: WayOut = { href: '/staff', label: 'Go to your start page' }

export function NoPermission({
  title,
  action,
  wayOut = START_PAGE,
}: {
  title: string
  action: string
  wayOut?: WayOut
}) {
  return (
    <main className="space-y-4">
      <h1>{title}</h1>
      <p role="alert">{`You do not have permission to ${action}.`}</p>
      <p>
        <Link href={wayOut.href}>{wayOut.label}</Link>
      </p>
    </main>
  )
}
