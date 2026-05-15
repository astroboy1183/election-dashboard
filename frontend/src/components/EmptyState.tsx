interface EmptyStateProps {
  emoji?: string
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
  variant?: 'empty' | 'error'
}

/**
 * Consistent "no results" / "failed to load" surface used across pages.
 * Pass `variant="error"` for failure UX (red accent + suggested retry).
 */
export function EmptyState({ emoji, title, body, action, variant = 'empty' }: EmptyStateProps) {
  const accent = variant === 'error' ? '#ef4444' : 'var(--accent)'
  const bg = variant === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(167,139,250,0.05)'
  return (
    <div
      className="card"
      role={variant === 'error' ? 'alert' : 'status'}
      style={{
        textAlign: 'center',
        padding: '2.5rem 1.5rem',
        background: bg,
        borderColor: variant === 'error' ? 'rgba(239,68,68,0.25)' : undefined,
      }}
    >
      <div style={{ fontSize: '2.2rem', marginBottom: 10, opacity: 0.85 }}>
        {emoji ?? (variant === 'error' ? '⚠️' : '🔍')}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        {title}
      </div>
      {body && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto', lineHeight: 1.5 }}>
          {body}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 16,
            padding: '0.45rem 1rem',
            borderRadius: 8,
            background: `${accent}1a`,
            border: `1px solid ${accent}55`,
            color: accent,
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
