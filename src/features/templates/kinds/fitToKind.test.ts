import { describe, expect, it } from 'vitest'
import { doc, locked, para, section } from '@/features/templates/doc/build'
import { fitDocToKind } from '@/features/templates/kinds/fitToKind'

describe('fitDocToKind', () => {
  it('drops blocks of the old kind, keeps the wording and adds the new required blocks', () => {
    const fitted = fitDocToKind(
      doc(para('Our own words.'), locked('decision.appealRights'), section('trc.comments')),
      'enforcement_order',
    )
    expect(fitted.content.map((n) => n.attrs?.source ?? n.type)).toEqual([
      'paragraph',
      'order.ceaseSentence',
      'order.motionNotice',
      'order.lienWarning',
    ])
  })
})
