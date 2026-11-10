export async function register(): Promise<void> {
  const { env } = await import('@/config/env')
  if (env.NEXT_RUNTIME === 'edge' || !env.CHIBAN_DEMO_MODE) return
  const { db } = await import('@/db/client')
  const { exitIfUnsafeDemo } = await import('@/features/demo/demoStartup')
  await exitIfUnsafeDemo(db)
}
