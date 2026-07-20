/** Track geometry — a "stadium" (rounded-rectangle) one-way loop. */
export interface TrackPoint {
  x: number
  y: number
  a: number // heading, radians
}

export interface Track {
  xy: (frac: number) => TrackPoint
  per: number // perimeter, px
}

export function makeTrack(w: number, h: number, pad: number): Track {
  const bw = w - 2 * pad
  const bh = h - 2 * pad
  const r = bh / 2
  const straight = Math.max(1, bw - 2 * r)
  const per = 2 * straight + 2 * Math.PI * r
  // frac=0 at top-left of top straight, clockwise
  function xy(frac: number): TrackPoint {
    let d = frac * per
    const cx1 = pad + r + straight
    const cx2 = pad + r
    const cy = pad + r
    if (d < straight) return { x: pad + r + d, y: pad, a: 0 }
    d -= straight
    if (d < Math.PI * r) {
      const th = d / r - Math.PI / 2
      return { x: cx1 + r * Math.cos(th), y: cy + r * Math.sin(th), a: th + Math.PI / 2 }
    }
    d -= Math.PI * r
    if (d < straight) return { x: pad + r + straight - d, y: pad + bh, a: Math.PI }
    d -= straight
    const th = d / r + Math.PI / 2
    return { x: cx2 + r * Math.cos(th), y: cy + r * Math.sin(th), a: th + Math.PI / 2 }
  }
  return { xy, per }
}
