import { describe, expect, it } from 'vitest'
import { discardOffer } from '@/features/config/discardOffer'

const action = () => Promise.resolve({ ok: true as const, message: '' })

describe('discardOffer', () => {
  it('offers nothing without a draft', () => {
    expect(discardOffer([{ status: 'published' }], action)).toEqual({})
    expect(discardOffer([], action)).toEqual({})
  })

  it('marks a draft over a published version as not never-published', () => {
    expect(discardOffer([{ status: 'draft' }, { status: 'published' }], action)).toEqual({
      discard: { neverPublished: false, action },
    })
  })

  it('marks a lone draft as never published', () => {
    expect(discardOffer([{ status: 'draft' }], action)).toEqual({
      discard: { neverPublished: true, action },
    })
  })

  it('treats a draft over only superseded versions as published before', () => {
    expect(discardOffer([{ status: 'draft' }, { status: 'superseded' }], action)).toEqual({
      discard: { neverPublished: false, action },
    })
  })
})
