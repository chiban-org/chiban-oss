import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupByPersona, ManifestError, outputPath, parseManifest } from './shotManifest'

const valid = {
  file: 'operations/health.png',
  persona: 'Avery Admin',
  path: '/staff/admin/health',
  width: 1280,
  height: 800,
}

describe('parseManifest', () => {
  it('accepts a well formed array', () => {
    assert.deepEqual(parseManifest('operations.json', [valid]), [valid])
  })

  it('accepts an empty array', () => {
    assert.deepEqual(parseManifest('operations.json', []), [])
  })

  it('rejects a manifest that is not an array', () => {
    assert.throws(() => parseManifest('x.json', { shots: [] }), ManifestError)
  })

  it('rejects a path that does not start with a slash', () => {
    assert.throws(() => parseManifest('x.json', [{ ...valid, path: 'staff' }]), /path must start/)
    assert.throws(
      () => parseManifest('x.json', [{ ...valid, path: '//evil.test' }]),
      /path must start/,
    )
  })

  it('rejects a file that is not a png inside the shots folder', () => {
    assert.throws(() => parseManifest('x.json', [{ ...valid, file: 'a/b.jpg' }]), /relative .png/)
    assert.throws(() => parseManifest('x.json', [{ ...valid, file: '../b.png' }]), /relative .png/)
    assert.throws(() => parseManifest('x.json', [{ ...valid, file: '/b.png' }]), /relative .png/)
  })

  it('rejects missing persona and bad sizes', () => {
    assert.throws(() => parseManifest('x.json', [{ ...valid, persona: ' ' }]), /persona/)
    assert.throws(() => parseManifest('x.json', [{ ...valid, width: 0 }]), /width/)
    assert.throws(() => parseManifest('x.json', [{ ...valid, height: '800' }]), /height/)
  })

  it('rejects the same file listed twice', () => {
    assert.throws(() => parseManifest('x.json', [valid, valid]), /appears twice/)
  })

  it('names the entry that is wrong', () => {
    assert.throws(
      () => parseManifest('x.json', [valid, { ...valid, file: 'b.png', width: -1 }]),
      /x.json\[1\]/,
    )
  })
})

describe('groupByPersona', () => {
  it('keeps shots in order under each persona', () => {
    const other = { ...valid, file: 'operations/b.png', persona: 'Sam Clerk' }
    const third = { ...valid, file: 'operations/c.png' }
    const groups = groupByPersona([valid, other, third])
    assert.deepEqual([...groups.keys()], ['Avery Admin', 'Sam Clerk'])
    assert.deepEqual(groups.get('Avery Admin'), [valid, third])
  })
})

describe('outputPath', () => {
  it('places the file under the images root', () => {
    assert.equal(outputPath('/img/shots', valid), '/img/shots/operations/health.png')
  })
})

describe('open', () => {
  it('keeps the link text to open from the listed page', () => {
    const [shot] = parseManifest('x.json', [{ ...valid, open: 'BP-2026-0001' }])
    assert.deepEqual(shot.open, ['BP-2026-0001'])
  })

  it('keeps several links to open in order', () => {
    const [shot] = parseManifest('x.json', [{ ...valid, open: ['EL-2026-0001', 'Final inspection'] }])
    assert.deepEqual(shot.open, ['EL-2026-0001', 'Final inspection'])
  })

  it('leaves open out when the entry has none', () => {
    const [shot] = parseManifest('x.json', [valid])
    assert.equal('open' in shot, false)
  })

  it('rejects open that is not text', () => {
    assert.throws(() => parseManifest('x.json', [{ ...valid, open: 7 }]), /open must be text/)
    assert.throws(() => parseManifest('x.json', [{ ...valid, open: ' ' }]), /open must be text/)
    assert.throws(() => parseManifest('x.json', [{ ...valid, open: [] }]), /open must be text/)
    assert.throws(() => parseManifest('x.json', [{ ...valid, open: ['a', 3] }]), /open must be text/)
  })
})
