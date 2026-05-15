/**
 * Shared chart styling so the 7+ Recharts BarCharts across the dashboard
 * have consistent typography, tooltips, axis ticks, and reference lines.
 */
import { fmtCompact, fmtIN } from './format'

// ─────────────────────────  Axis defaults  ─────────────────────────

export const axisTickStyle = { fontSize: 11, fill: 'var(--text-secondary)' } as const

/** Use as `tickFormatter={fmtAxisTick}` on numeric axes. */
export const fmtAxisTick = (v: any) => fmtCompact(typeof v === 'number' ? v : Number(v) || 0)

/** Use for axes that already speak in 1000s ("vps_k" etc.) — keeps "k" suffix. */
export const fmtAxisTickKilo = (v: any) => `${v}k`

/** Use for percent axes. */
export const fmtAxisTickPct = (v: any) => `${v}%`

// ─────────────────────────  Tooltip ─────────────────────────

export const tooltipContentStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '0.55rem 0.75rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  fontSize: '0.82rem',
}

export const tooltipLabelStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 700,
  marginBottom: 4,
}

export const tooltipItemStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
}

// ─────────────────────────  Reference lines  ─────────────────────────

export const refLineStyle = {
  stroke: '#eab308',
  strokeWidth: 1.5,
  strokeDasharray: '4 4',
}

export const zeroLineStyle = {
  stroke: '#64748b',
  strokeWidth: 1,
}

// ─────────────────────────  Color helpers  ─────────────────────────

/** Lighten a hex color by mixing with white. */
export const lighten = (hex: string, amount = 0.2): string => {
  const m = hex.replace('#', '').match(/.{1,2}/g)
  if (!m || m.length < 3) return hex
  const [r, g, b] = m.slice(0, 3).map(h => parseInt(h, 16))
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// ─────────────────────────  Rank labels  ─────────────────────────

/** Returns 🥇🥈🥉 for the top three, "#N" for the rest. */
export const rankLabel = (idx: number): string => {
  if (idx === 0) return '🥇'
  if (idx === 1) return '🥈'
  if (idx === 2) return '🥉'
  return `#${idx + 1}`
}

// Re-export for convenience in chart-rendering files.
export { fmtCompact, fmtIN }
