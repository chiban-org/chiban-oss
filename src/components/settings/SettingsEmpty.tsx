import type { ReactNode } from 'react'

export function SettingsEmpty({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col items-start gap-3 py-4">
      <h2>{title}</h2>
      <p className="max-w-[60ch] text-muted-foreground">{description}</p>
      {action}
    </section>
  )
}
