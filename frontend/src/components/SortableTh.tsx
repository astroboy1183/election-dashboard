import type { SortState } from '../lib/useSortable'
import { sortIcon } from '../lib/useSortable'

interface Props {
  label: string
  sortKey: string
  sort: SortState | null
  // Accept either the legacy single-key signature or the new (key, opts) signature.
  onSort: (key: string, opts?: { additive?: boolean }) => void
  align?: 'left' | 'right' | 'center'
  width?: number | string
}

/**
 * Drop-in <th> with click-to-sort behaviour.
 *
 *   <SortableTh label="Margin" sortKey="margin" sort={sort} onSort={onSort} align="right" />
 *
 * Click  → replace the sort chain with this column.
 * Shift+click → add this column as a tiebreaker (or toggle its direction if already in the chain).
 */
export default function SortableTh({ label, sortKey, sort, onSort, align = 'left', width }: Props) {
  const entry = sort?.find(e => e.key === sortKey)
  const active = !!entry
  const sortDirLabel = entry ? (entry.dir === 'asc' ? 'ascending' : 'descending') : 'unsorted'
  return (
    <th
      onClick={(e) => onSort(sortKey, { additive: e.shiftKey })}
      role="columnheader"
      aria-sort={entry ? (entry.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      aria-label={`Sort by ${label} (currently ${sortDirLabel})`}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        textAlign: align,
        width,
        whiteSpace: 'nowrap',
      }}
      title="Click to sort · Shift+click to add as a tiebreaker"
    >
      {label}{' '}
      <span style={{ opacity: active ? 1 : 0.35, fontSize: '0.85em', marginLeft: 2 }} aria-hidden="true">
        {sortIcon(sort, sortKey)}
      </span>
    </th>
  )
}
