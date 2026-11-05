'use client'

import { useEffect, useState } from 'react'

export function TransientNotice({ children }: { children: string }) {
  const [shown, setShown] = useState(true)
  useEffect(() => {
    const hide = () => setShown(false)
    document.addEventListener('submit', hide, true)
    return () => document.removeEventListener('submit', hide, true)
  }, [])
  if (!shown) return null
  return (
    <p role="status" className="mb-6 rounded-md bg-highlight px-3 py-2">
      {children}
    </p>
  )
}
