import Link from 'next/link'
import { isDemoMode } from '@/features/demo/demoMode'
import { DEMO_PATH } from '@/features/demo/personas'

export function TryDemoLink() {
  if (!isDemoMode()) return null
  return (
    <p className="mt-6">
      {'Looking around? '}
      <Link href={DEMO_PATH}>Try the demo without an account</Link>
    </p>
  )
}
