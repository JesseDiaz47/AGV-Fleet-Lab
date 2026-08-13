/**
 * The live view must not rebuild its fleet on every render.
 *
 * `useRef(x)` evaluates `x` on every render and keeps only the first result,
 * so `useRef(buildSim(params))` quietly constructs a full Sim — stations,
 * vehicles, two PRNG streams — and discards it, every time the component
 * renders. The rAF loop in this hook bumps `frame` on each tick, so while the
 * live view is running that is roughly 60 built-and-thrown-away fleets per
 * second.
 *
 * Identity checks cannot catch this: the ref keeps the FIRST value either
 * way, so `sim` stays stable while the waste happens behind it. The only
 * assertion that sees it is a count of constructor calls, which is what this
 * file does.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { defaultParams } from '../lib/defaults.ts'

const { counter } = vi.hoisted(() => ({ counter: { builds: 0 } }))

vi.mock('../lib/engine/sim.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/engine/sim.ts')>()
  return {
    ...actual,
    // Behaviourally the real Sim — it just keeps a tally of how often the
    // engine was asked for a new one.
    Sim: class CountingSim extends actual.Sim {
      constructor(...args: ConstructorParameters<typeof actual.Sim>) {
        super(...args)
        counter.builds++
      }
    },
  }
})

const { useLiveSim } = await import('./useLiveSim.ts')

describe('useLiveSim — lazy construction', () => {
  it('builds no new Sim when re-rendered with unchanged params', () => {
    const props = { id: 'lazy', p: defaultParams() }
    const { rerender } = renderHook(({ id, p }) => useLiveSim(id, p), { initialProps: props })

    // Mount cost is whatever it is (the mount effects restart deliberately).
    // What must not grow is the per-render cost after that.
    const afterMount = counter.builds
    expect(afterMount).toBeGreaterThan(0)

    // The same object each time: no params change, so nothing legitimately
    // needs rebuilding. This is exactly what an animating rAF frame looks
    // like to the hook.
    for (let i = 0; i < 10; i++) rerender(props)

    expect(counter.builds).toBe(afterMount)
  })

  it('still rebuilds when the caller explicitly restarts', () => {
    // The counterweight: making construction lazy must not make it lazy
    // forever. Restart is the hook's whole contract for applying edits.
    const props = { id: 'restart', p: defaultParams() }
    const { result, rerender } = renderHook(({ id, p }) => useLiveSim(id, p), { initialProps: props })
    rerender(props)

    const before = counter.builds
    act(() => result.current.restart())
    expect(counter.builds).toBe(before + 1)
  })
})
