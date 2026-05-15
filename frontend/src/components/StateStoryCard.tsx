import { useStateStory } from '../lib/api'
import { Skeleton } from './Skeleton'

/**
 * Compact 1-line headline + optional tagline that introduces the state's
 * 2026 result. Sits above InsightsCard (which gives the bulleted detail).
 *
 * Visual goal: feel like a section subtitle / blurb, NOT another panel
 * competing with InsightsCard. Hence the slim padding, accent left border,
 * and a single-tone background.
 */
export default function StateStoryCard({ state }: { state: string }) {
  const { data, isLoading, isError, error } = useStateStory(state)

  if (isLoading) {
    return (
      <div style={wrapStyle}>
        <Skeleton height={14} width="70%" />
        <Skeleton height={12} width="50%" style={{ marginTop: 6 }} />
      </div>
    )
  }

  if (isError) {
    const msg = (error as any)?.response?.data?.detail ?? (error as any)?.message ?? 'Unknown error'
    return (
      <div style={{ ...wrapStyle, borderLeftColor: '#ef4444', background: 'rgba(239,68,68,0.05)' }}>
        <span style={{ color: '#fca5a5', fontSize: '0.85rem' }}>Story unavailable — {msg}</span>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={wrapStyle}>
      <span style={{
        fontSize: '0.62rem', fontWeight: 700, color: '#a78bfa',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        marginRight: 10, flexShrink: 0,
      }}>
        Story
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.95rem', lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 600 }}>
          {data.headline}
        </div>
        {data.tagline && (
          <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--text-secondary)', marginTop: 3 }}>
            {data.tagline}
          </div>
        )}
      </div>
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  padding: '0.7rem 0.95rem',
  marginBottom: '1rem',
  borderRadius: 8,
  background: 'linear-gradient(135deg, rgba(139,92,246,0.07) 0%, rgba(6,182,212,0.03) 100%)',
  border: '1px solid rgba(139,92,246,0.22)',
  borderLeft: '3px solid #a78bfa',
}
