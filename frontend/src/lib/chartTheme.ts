/**
 * Shared chart styling so the 7+ Recharts BarCharts across the dashboard
 * have consistent typography, tooltips, and reference lines.
 */
import { fmtCompact, fmtIN } from './format'

// ─────────────────────────  Axis defaults  ─────────────────────────

export const axisTickStyle = { fontSize: 11, fill: 'var(--text-secondary)' } as const

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

// ─────────────────────────  Reference lines  ─────────────────────────

export const refLineStyle = {
  stroke: '#eab308',
  strokeWidth: 1.5,
  strokeDasharray: '4 4',
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
