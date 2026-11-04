'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { AddressHint } from '@/components/address/AddressHint'
import { useAddressCheck } from '@/components/address/useAddressCheck'
import { fitLines } from '@/features/address/suggestionLayout'

interface Props {
  lines: readonly string[]
  maxLines: number
  onUse: (lines: string[]) => void
  tapTarget?: boolean
  className?: string
  children: ReactNode
}

export function AddressCheck({ lines, maxLines, onUse, tapTarget, className, children }: Props) {
  const { suggestion, edited, left } = useAddressCheck()
  const key = lines.join('\n')
  const current = useRef(lines)
  const previousKey = useRef(key)
  current.current = lines

  useEffect(() => {
    if (key === previousKey.current) return
    previousKey.current = key
    edited(current.current)
  }, [key, edited])

  return (
    <div
      className={className}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        left(current.current)
      }}
    >
      {children}
      <AddressHint
        suggestion={suggestion}
        tapTarget={tapTarget}
        onUse={(chosen) => onUse(fitLines(chosen.lines, maxLines))}
      />
    </div>
  )
}
