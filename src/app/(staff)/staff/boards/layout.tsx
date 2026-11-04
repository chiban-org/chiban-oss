import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { boardMemberHome } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'

export default async function BoardsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaffContext()
  const home = boardMemberHome(await loadNavViewer(ctx.db, ctx.actor, ctx.signal))
  if (home !== null) redirect(home)
  return <>{children}</>
}
