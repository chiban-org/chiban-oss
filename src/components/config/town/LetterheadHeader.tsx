import { townImageUrl } from '@/components/config/town/ImageUpload'
import type { DocumentFrame } from '@/features/pdf/frame'
import type { TownImage } from '@/features/town/profileSchema'
import { cn } from '@/lib/utils'

export function LetterheadHeader({
  frame,
  logo,
}: {
  frame: DocumentFrame
  logo: TownImage | null
}) {
  const centered = frame.logoPosition === 'center'
  return (
    <div className={cn('flex gap-3', centered ? 'flex-col items-center text-center' : '')}>
      {logo === null ? null : (
        <img
          src={townImageUrl(logo)}
          alt="Town logo"
          className="max-h-14 max-w-28 shrink-0 object-contain"
        />
      )}
      <div className="min-w-0">
        <p className="m-0 font-serif text-lg leading-tight font-semibold">{frame.townName}</p>
        {frame.officeName === '' ? null : (
          <p className="m-0 text-xs font-bold">{frame.officeName}</p>
        )}
        {frame.headerLines.map((line) => (
          <p key={line} className="m-0 text-[0.65rem] text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
