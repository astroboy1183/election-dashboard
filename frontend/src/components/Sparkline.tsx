interface SparklineProps {
  values: number[]            // ordered series, e.g. [2021_share, 2026_share]
  color?: string
  width?: number
  height?: number
  fill?: boolean              // shade under the line
  showDots?: boolean
  baseline?: number           // optional reference line (e.g. zero)
  ariaLabel?: string
}

/**
 * Tiny inline trend chart. No axes, no labels — just a line. Designed to live
 * inside table cells and party-row chips to give immediate sense of direction.
 */
export function Sparkline({
  values, color = '#a78bfa', width = 64, height = 20,
  fill = true, showDots = true, baseline,
  ariaLabel,
}: SparklineProps) {
  if (!values || values.length < 2) {
    return <span style={{ display: 'inline-block', width, height }} />
  }
  const min = Math.min(...values, ...(baseline !== undefined ? [baseline] : []))
  const max = Math.max(...values, ...(baseline !== undefined ? [baseline] : []))
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  const pad = 2
  const yOf = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)
  const pts = values.map((v, i) => [i * stepX, yOf(v)] as const)
  const linePath = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ')
  const fillPath = `${linePath} L${width},${height} L0,${height} Z`
  const last = pts[pts.length - 1]
  const first = pts[0]
  const up = values[values.length - 1] >= values[0]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? 'trend'}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {fill && (
        <path d={fillPath} fill={color} opacity={0.18} />
      )}
      <path d={linePath} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {showDots && (
        <>
          <circle cx={first[0]} cy={first[1]} r={2} fill={color} opacity={0.55} />
          <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
        </>
      )}
      {/* tiny direction marker on the end */}
      {showDots && (
        <text x={width - 1} y={up ? 8 : height - 2} fontSize={7} textAnchor="end" fill={color} opacity={0.7}>
          {up ? '▲' : '▼'}
        </text>
      )}
    </svg>
  )
}

/** Horizontal bar showing a value against a reference total (e.g. margin / total votes). */
export function MicroBar({
  value, total, color = '#a78bfa', width = 70, height = 6,
}: { value: number; total: number; color?: string; width?: number; height?: number }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <span style={{
      display: 'inline-block',
      width, height,
      borderRadius: 999,
      background: 'rgba(255,255,255,0.06)',
      verticalAlign: 'middle',
      overflow: 'hidden',
    }}>
      <span style={{
        display: 'block',
        width: `${pct}%`,
        height: '100%',
        background: color,
        borderRadius: 999,
        transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
      }} />
    </span>
  )
}
