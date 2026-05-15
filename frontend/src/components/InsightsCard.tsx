/**
 * Auto-derived narrative insights — a small grid of headline + detail cards.
 *
 *   <InsightsCard insights={[
 *     { emoji: '🏛️', accent: '#22c55e', headline: 'NDA forms the government', detail: 'Won 102 of 126...' },
 *   ]} />
 *
 * Each page computes its own insights from already-available data and passes
 * them in. Use a short headline (one sentence) and a longer supporting detail.
 */

export interface Insight {
  emoji: string
  accent: string
  headline: string
  detail: string
}

export default function InsightsCard({
  insights,
  title = 'Key Insights',
  subtitle = 'Auto-derived from the data on this page',
}: {
  insights: Insight[]
  title?: string
  subtitle?: string
}) {
  if (!insights || insights.length === 0) return null
  return (
    <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{subtitle}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {insights.map((ins, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: '0.7rem 0.9rem',
            borderRadius: 8, background: 'var(--bg-secondary)',
            borderLeft: `3px solid ${ins.accent}`,
          }}>
            <span style={{ fontSize: '1.4rem', lineHeight: 1.1, flexShrink: 0 }}>{ins.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: ins.accent, lineHeight: 1.3, marginBottom: 4 }}>
                {ins.headline}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {ins.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
