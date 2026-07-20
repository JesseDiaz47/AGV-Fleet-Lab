import { describe, expect, it } from 'vitest'
import { makeTrack } from './track.ts'

describe('makeTrack', () => {
  it('closes: frac=0 and frac=1 land on (nearly) the same point', () => {
    const tr = makeTrack(600, 300, 30)
    const p0 = tr.xy(0)
    const p1 = tr.xy(1 - 1e-9)
    expect(Math.hypot(p0.x - p1.x, p0.y - p1.y)).toBeLessThan(0.5)
  })
})
