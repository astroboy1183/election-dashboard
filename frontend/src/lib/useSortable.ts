import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'

export interface SortEntry {
  key: string
  dir: SortDir
}

/** A sort chain (primary first, then tiebreakers). */
export type SortState<_T = unknown> = SortEntry[]

/**
 * Generic sortable-table hook with **multi-column sort** support.
 *
 * Usage:
 *   const { sorted, sort, onSort } = useSortable(rows, [{ key: 'margin', dir: 'desc' }])
 *   <SortableTh label="Margin" sortKey="margin" sort={sort} onSort={onSort} />
 *
 * Interaction model:
 *   - Click a column → replaces the entire sort chain with just that column.
 *   - Shift-click a column → appends it to the chain as a tiebreaker
 *     (or toggles direction if it's already in the chain).
 *
 * `getValue` lets you sort by a derived value when the data field itself
 * is nested or computed (e.g., sort party badges by `c.party` string).
 */
export function useSortable<T extends Record<string, any>>(
  data: T[] | undefined,
  initial?: SortState<T> | SortEntry | null,
  getValue?: (row: T, key: string) => any,
) {
  // Normalize initial value: legacy callers may have passed a single SortEntry.
  const seed: SortState = initial == null
    ? []
    : Array.isArray(initial) ? initial : [initial]
  const [sort, setSort] = useState<SortState>(seed)

  const sorted = useMemo(() => {
    const arr = data ?? []
    if (sort.length === 0) return arr
    return [...arr].sort((a, b) => {
      for (const entry of sort) {
        const key = entry.key
        const av = getValue ? getValue(a, key) : (a as any)[key]
        const bv = getValue ? getValue(b, key) : (b as any)[key]
        let cmp = 0
        if (av == null && bv == null) cmp = 0
        else if (av == null) cmp = 1
        else if (bv == null) cmp = -1
        else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
        else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
        if (cmp !== 0) return entry.dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [data, sort, getValue])

  const defaultDirFor = (key: string): SortDir => {
    // Numeric-looking columns sort high-to-low by default; text-looking ones asc.
    const numericish = /margin|vote|share|seat|count|age|asset|criminal|change|swing|won|contested|rank|flipped|held|churn|new/i.test(key)
    return numericish ? 'desc' : 'asc'
  }

  const onSort = (key: string, opts?: { additive?: boolean }) => {
    setSort(prev => {
      const idx = prev.findIndex(e => e.key === key)
      if (opts?.additive) {
        // Shift-click: toggle direction if present, otherwise append.
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { key, dir: next[idx].dir === 'asc' ? 'desc' : 'asc' }
          return next
        }
        return [...prev, { key, dir: defaultDirFor(key) }]
      }
      // Plain click: toggle the direction if it's the only sort already; otherwise reset to this column.
      if (prev.length === 1 && prev[0].key === key) {
        return [{ key, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }]
      }
      return [{ key, dir: defaultDirFor(key) }]
    })
  }

  return { sorted, sort, onSort }
}

/**
 * Arrow indicator for a column header given the current sort chain.
 * Returns '↑', '↓' (or with a rank suffix like '↓²' for secondary sorts),
 * or '↕' if the column is not currently part of the sort chain.
 */
export function sortIcon(sort: SortState | null, key: string): string {
  if (!sort || sort.length === 0) return '↕'
  const idx = sort.findIndex(e => e.key === key)
  if (idx < 0) return '↕'
  const arrow = sort[idx].dir === 'asc' ? '↑' : '↓'
  if (sort.length === 1) return arrow
  // Multi-column: append rank superscript so users can read the priority
  const sup = ['¹', '²', '³', '⁴', '⁵'][idx] ?? `^${idx + 1}`
  return `${arrow}${sup}`
}
