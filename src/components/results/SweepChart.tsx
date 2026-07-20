import { useMemo } from 'react'
import { buildSweepScales, findRollover, pickKnee, type SweepPoint } from '../../lib/engine/sweep.ts'
import { fmtNum } from '../../lib/format.ts'

interface SweepChartProps {
  results: SweepPoint[]
  demand: number
}

/** Two-panel (throughput / blocked) sweep chart, real SVG/JSX — no string-built markup. */
export function SweepChart({ results, demand }: SweepChartProps) {
  const scales = useMemo(() => buildSweepScales(results, demand), [results, demand])
  const knee = useMemo(() => pickKnee(results), [results])
  const rollover = useMemo(() => findRollover(results), [results])

  if (results.length === 0) return null

  const { width, height, padLeft, padRight, throughputTop, throughputBottom, blockedTop, blockedBottom, x, yThroughput, yBlocked, throughputMax, blockedMax } =
    scales

  const throughputPath = results.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.n)} ${yThroughput(r.tph)}`).join(' ')
  const blockedPath = results.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.n)} ${yBlocked(r.blocked * 100)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="sweep-chart" role="img" aria-label="Fleet-size sweep chart">
      {/* throughput panel */}
      <text x={padLeft} y={throughputTop - 10} className="sweep-chart__title">
        Throughput (jobs/hr) vs. fleet size
      </text>
      <line x1={padLeft} y1={yThroughput(demand)} x2={width - padRight} y2={yThroughput(demand)} className="sweep-chart__demand-line" />
      <text x={width - padRight} y={yThroughput(demand) - 4} textAnchor="end" className="sweep-chart__demand-label">
        demand {fmtNum(demand)}
      </text>
      <line x1={padLeft} y1={throughputBottom} x2={width - padRight} y2={throughputBottom} className="sweep-chart__axis" />
      <line x1={padLeft} y1={throughputTop} x2={padLeft} y2={throughputBottom} className="sweep-chart__axis" />
      <text x={padLeft - 6} y={throughputTop + 4} textAnchor="end" className="sweep-chart__tick">
        {fmtNum(throughputMax)}
      </text>
      <text x={padLeft - 6} y={throughputBottom} textAnchor="end" className="sweep-chart__tick">
        0
      </text>
      <path d={throughputPath} className="sweep-chart__line sweep-chart__line--throughput" />
      {results.map((r) => (
        <circle
          key={r.n}
          cx={x(r.n)}
          cy={yThroughput(r.tph)}
          r={r.n === knee ? 5 : 3}
          className={`sweep-chart__point${r.met ? ' sweep-chart__point--met' : ''}`}
        />
      ))}
      {knee !== null && (
        <line x1={x(knee)} y1={throughputTop} x2={x(knee)} y2={blockedBottom} className="sweep-chart__knee-line" />
      )}
      {rollover !== null && (
        <text x={x(rollover)} y={throughputTop - 10} textAnchor="middle" className="sweep-chart__rollover-label">
          rollover
        </text>
      )}

      {/* blocked panel */}
      <text x={padLeft} y={blockedTop - 8} className="sweep-chart__title">
        Blocked share (%) vs. fleet size
      </text>
      <line x1={padLeft} y1={blockedBottom} x2={width - padRight} y2={blockedBottom} className="sweep-chart__axis" />
      <line x1={padLeft} y1={blockedTop} x2={padLeft} y2={blockedBottom} className="sweep-chart__axis" />
      <text x={padLeft - 6} y={blockedTop + 4} textAnchor="end" className="sweep-chart__tick">
        {fmtNum(blockedMax)}
      </text>
      <text x={padLeft - 6} y={blockedBottom} textAnchor="end" className="sweep-chart__tick">
        0
      </text>
      <path d={blockedPath} className="sweep-chart__line sweep-chart__line--blocked" />
      {results.map((r) => (
        <circle key={r.n} cx={x(r.n)} cy={yBlocked(r.blocked * 100)} r={3} className="sweep-chart__point sweep-chart__point--blocked" />
      ))}

      {/* shared x axis labels */}
      {results.map((r) => (
        <text key={r.n} x={x(r.n)} y={blockedBottom + 16} textAnchor="middle" className="sweep-chart__tick">
          {r.n}
        </text>
      ))}
    </svg>
  )
}
