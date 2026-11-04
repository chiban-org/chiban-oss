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
      <h2 className="m-0">{title}</h2>
      <p className="m-0 max-w-[60ch] text-muted-foreground">{description}</p>
      {action}
    </section>
  )
}
