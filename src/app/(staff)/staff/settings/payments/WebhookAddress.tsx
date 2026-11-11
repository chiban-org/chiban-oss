'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_NOTE: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied.',
  failed: 'Copying did not work. Select the address and copy it.',
}

export function WebhookAddress({ address }: { address: string }) {
  const id = useId()
  const [state, setState] = useState<CopyState>('idle')
  const copy = () => {
    navigator.clipboard.writeText(address).then(
      () => {
        setState('copied')
      },
      () => {
        setState('failed')
      },
    )
  }
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        Webhook address
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={address}
          className="font-mono"
          onFocus={(event) => {
            event.currentTarget.select()
          }}
        />
        <Button type="button" variant="outline" onClick={copy}>
          Copy address
        </Button>
      </div>
      <p role="status" className="m-0 text-sm text-muted-foreground">
        {COPY_NOTE[state]}
      </p>
    </div>
  )
}
