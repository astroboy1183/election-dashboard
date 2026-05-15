import React from 'react'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: number | string
  style?: React.CSSProperties
  className?: string
}

/** Shimmering placeholder block. Use to fill the shape of content that's loading. */
export function Skeleton({ width = '100%', height = 16, radius = 6, style, className }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className ?? ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}

/** Page-level skeleton: KPI strip + content blocks. Mirrors most dashboard pages. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <Skeleton width={220} height={24} />
      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card" style={{ padding: '1rem 1.25rem' }}>
            <Skeleton width={80} height={10} />
            <Skeleton width="60%" height={26} style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div className="card">
        <Skeleton width={160} height={12} />
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} height={14} width={`${70 + ((i * 13) % 30)}%`} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Skeleton for a table that's still loading. */
export function TableSkeleton({ cols = 6, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} width={i === 0 ? 40 : i === 1 ? 140 : 80} height={10} />
          ))}
        </div>
      </div>
      <div style={{ padding: '0.5rem 1rem 1rem' }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} style={{ display: 'flex', gap: 14, padding: '0.55rem 0', borderBottom: '1px solid var(--border)' }}>
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} width={c === 0 ? 40 : c === 1 ? 140 : 80} height={12} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
