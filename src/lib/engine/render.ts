/**
 * Canvas rendering for the live track view. Framework-free: takes a canvas
 * element and plain sim data, draws directly via the Canvas API. React only
 * owns the requestAnimationFrame loop that calls this — see
 * components/simview/SimView.tsx.
 *
 * Ported 1:1 from the v1 tool's render.js.
 */
import { ST, type Sim, type VehicleState } from './sim.ts'
import { makeTrack } from './track.ts'

export const STATE_COLOR: Partial<Record<VehicleState, string>> = {
  [ST.TO_DROP]: '#3987e5',
  [ST.TO_PICKUP]: '#199e70',
  [ST.LOADING]: '#9085e9',
  [ST.UNLOADING]: '#9085e9',
  [ST.TO_CHARGE]: '#c98500',
  [ST.CHARGING]: '#c98500',
  [ST.STRANDED]: '#d03b3b',
}

export function draw(canvas: HTMLCanvasElement, sim: Sim, blockedIds: Set<number>): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const track = makeTrack(w, h, 34)

  // guide path
  ctx.beginPath()
  for (let i = 0; i <= 240; i++) {
    const p = track.xy(i / 240)
    if (i) ctx.lineTo(p.x, p.y)
    else ctx.moveTo(p.x, p.y)
  }
  ctx.closePath()
  ctx.strokeStyle = '#2c2c2a'
  ctx.lineWidth = 10
  ctx.stroke()
  ctx.strokeStyle = '#383835'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // direction arrows
  ctx.fillStyle = '#52514e'
  for (const f of [0.125, 0.375, 0.625, 0.875]) {
    const p = track.xy(f)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.a)
    ctx.beginPath()
    ctx.moveTo(5, 0)
    ctx.lineTo(-3, -4)
    ctx.lineTo(-3, 4)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // stations
  for (const st of sim.stations) {
    const p = track.xy(st.s / sim.L)
    const off = 20
    const ox = Math.cos(p.a + Math.PI / 2) * off
    const oy = Math.sin(p.a + Math.PI / 2) * off
    ctx.fillStyle = '#1a1a19'
    ctx.strokeStyle = '#898781'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, 7)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#c3c2b7'
    ctx.fillText(`S${st.id + 1}`, p.x + ox, p.y + oy)
    if (st.waiting > 0) {
      ctx.fillStyle = '#fab219'
      ctx.fillText(`▲${st.waiting}`, p.x + ox, p.y + oy + 13)
    }
  }

  // charge bay on a spur off the path
  const bay = track.xy(sim.chargeBayS / sim.L)
  const bayNx = Math.cos(bay.a + Math.PI / 2)
  const bayNy = Math.sin(bay.a + Math.PI / 2)
  ctx.strokeStyle = '#52514e'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(bay.x, bay.y)
  ctx.lineTo(bay.x + bayNx * 26, bay.y + bayNy * 26)
  ctx.stroke()
  ctx.fillStyle = '#c98500'
  ctx.fillText('⚡', bay.x + bayNx * 38, bay.y + bayNy * 38)

  // vehicles (charging stack outward on the spur, parked stack inward, stranded pulled aside)
  const chargeStack = sim.vehicles.filter((v) => v.offTrack && v.state === ST.CHARGING).map((v) => v.id)
  const parkStack = sim.vehicles.filter((v) => v.offTrack && v.state === ST.IDLE).map((v) => v.id)
  for (const v of sim.vehicles) {
    let p: { x: number; y: number; a: number }
    if (v.offTrack && v.state === ST.CHARGING) {
      const k = chargeStack.indexOf(v.id)
      p = { x: bay.x + bayNx * (26 + k * 16), y: bay.y + bayNy * (26 + k * 16), a: bay.a }
    } else if (v.offTrack && v.state === ST.IDLE) {
      const k = parkStack.indexOf(v.id)
      p = { x: bay.x - bayNx * (20 + k * 16), y: bay.y - bayNy * (20 + k * 16), a: bay.a }
    } else if (v.offTrack) {
      const q = track.xy(v.pos / sim.L)
      p = { x: q.x - Math.cos(q.a + Math.PI / 2) * 18, y: q.y - Math.sin(q.a + Math.PI / 2) * 18, a: q.a }
    } else {
      p = track.xy(v.pos / sim.L)
    }
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.a)
    const color = blockedIds.has(v.id) ? '#e66767' : STATE_COLOR[v.state]
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(-8, -5.5, 16, 11, 3)
    else ctx.rect(-8, -5.5, 16, 11)
    if (color) {
      ctx.fillStyle = color
      ctx.fill()
    } else {
      ctx.fillStyle = '#1a1a19'
      ctx.fill()
      ctx.strokeStyle = '#898781'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    if (v.state === ST.TO_DROP) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, 2.5, 0, 7)
      ctx.fill()
    }
    ctx.restore()
  }
}
