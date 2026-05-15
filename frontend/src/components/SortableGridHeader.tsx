import { sortIcon, type SortState } from '../lib/useSortable'

interface ColumnDef {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  /** Optional override — set to false if a column shouldn't be sortable (e.g. a chevron / open arrow). */
  sortable?: boolean
}

interface Props {
  columns: ColumnDef[]
  sort: SortState | null
  onSort: (key: string, opts?: { additive?: boolean }) => void
  /** CSS `grid-template-columns` string. Should match the data-row layout. */
  gridTemplate: string
  /** Optional row padding (matches the data rows). */
  padding?: string
}

/**
 * Clickable column-header row for the CSS-grid-style mini tables used inside
 * modal popups (Close Contests, NOTA, Anti-incumbency, etc.). Reuses the
 * existing `useSortable` hook + `sortIcon` so the interaction model
 * (click = sort by this column, shift-click = add tiebreaker, click again =
 * toggle direction) is identical to the main page tables.
 */
export function SortableGridHeader({ columns, sort, onSort, gridTemplate, padding = '0.4rem 0.75rem' }: Props) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: gridTemplate, gap: '0.6rem',
      padding,
      fontSize: '0.62rem', color: 'var(--text-secondary)',
      textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
    }}>
      {columns.map(c => {
        const sortable = c.sortable !== false
        const align = c.align ?? 'left'
        const active = !!sort?.some(e => e.key === c.key)
        return (
          <span
            key={c.key}
            onClick={sortable ? (e) => onSort(c.key, { additive: e.shiftKey }) : undefined}
            role={sortable ? 'button' : undefined}
            tabIndex={sortable ? 0 : undefined}
            onKeyDown={sortable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(c.key) } } : undefined}
            title={sortable ? 'Click to sort · Shift+click to add as tiebreaker' : undefined}
            style={{
              textAlign: align,
              cursor: sortable ? 'pointer' : 'default',
              userSelect: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
            {c.label}
            {sortable && (
              <span style={{ opacity: active ? 1 : 0.35, fontSize: '0.78em' }}>
                {sortIcon(sort, c.key)}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}
