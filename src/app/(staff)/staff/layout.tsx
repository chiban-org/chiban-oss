import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { ServiceNotice } from '@/components/ServiceNotice'
import { StaffNav } from '@/components/staff/StaffNav'
import { navItemsFor } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { currentServiceState } from '@/features/town/serviceStatus'
import { createContext } from '@/server/trpc/context'

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const { actor, db, signal } = await createContext()
  if (actor?.kind !== 'staff') redirect('/staff/sign-in')
  const service = await currentServiceState(db, new Date(), signal)
  const navItems = navItemsFor(await loadNavViewer(db, actor, signal))
  return (
    <div className="staff-shell flex min-h-screen flex-col md:flex-row">
      <StaffNav items={navItems} />
      <div className="mx-auto w-full max-w-[var(--content-max-width)] flex-1 px-4 py-6 md:px-10 md:py-10">
        <ServiceNotice mode={service.mode} exportUntil={service.exportUntil} />
        {children}
      </div>
    </div>
  )
}
