import { NEW_TAB } from '@/components/newTab'

export function SeePublicLink({ href, className }: { href: string | null; className?: string }) {
  if (href === null) return null
  return (
    <a {...NEW_TAB} href={href} className={className}>
      See what the public sees
    </a>
  )
}
