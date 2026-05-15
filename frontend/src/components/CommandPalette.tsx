import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { api, useStates } from '../lib/api'

/**
 * Global ⌘K / Ctrl+K command palette.
 *
 * Sources searched (deferred-fetched the first time the palette opens, then
 * cached by React Query for the session):
 *   • States                — direct nav into Overview
 *   • Per-state constituencies (AC name + number)
 *   • Per-state parties (with alliance) — opens Results filtered by party
 *
 * Keyboard:
 *   ⌘K / Ctrl+K → open
 *   Esc         → close
 *   ↑ ↓         → navigate
 *   Enter       → activate
 */

type Item = {
  key: string
  group: 'States' | 'Constituencies' | 'Parties' | 'Pages'
  icon: string
  label: string
  meta?: string
  color?: string
  onSelect: () => void
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const { data: states } = useStates()

  // Lazily fetch per-state constituency + party data once the palette is opened.
  const enabled = open && !!states
  const queries = useQueries({
    queries: (states ?? []).flatMap(s => [
      {
        queryKey: ['cmdk-constituencies', s.slug],
        queryFn: () => api.get(`/${s.slug}/constituencies`).then(r => r.data),
        enabled,
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: ['cmdk-overview', s.slug],
        queryFn: () => api.get(`/${s.slug}/overview`).then(r => r.data),
        enabled,
        staleTime: 5 * 60 * 1000,
      },
    ]),
  })

  // Listen for ⌘K / Ctrl+K globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Reset query + selection when the palette opens.
  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      // Defer focus so the input is in the DOM
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  // Build the searchable item list.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const stateBySlug: Record<string, string> = {}
    ;(states ?? []).forEach(s => {
      stateBySlug[s.slug] = s.name
      out.push({
        key: `state-${s.slug}`,
        group: 'States',
        icon: '🏛️',
        label: s.name,
        meta: `${s.total_seats} seats`,
        onSelect: () => navigate(`/${s.slug}/overview`),
      })
    })
    // Constituencies and parties are paired in the queries array (2 per state).
    ;(states ?? []).forEach((s, i) => {
      const consData = queries[i * 2]?.data as any[] | undefined
      const overviewData = queries[i * 2 + 1]?.data as any
      ;(consData ?? []).forEach((c: any) => {
        out.push({
          key: `ac-${s.slug}-${c.ac_number}`,
          group: 'Constituencies',
          icon: '📍',
          label: `${c.name}`,
          meta: `AC ${c.ac_number} · ${s.name}`,
          color: c.color,
          onSelect: () => navigate(`/${s.slug}/constituencies/${c.ac_number}`),
        })
      })
      ;(overviewData?.parties ?? []).forEach((p: any) => {
        if (p.seats <= 0) return
        out.push({
          key: `party-${s.slug}-${p.party}`,
          group: 'Parties',
          icon: '🎯',
          label: `${p.party} — ${s.name}`,
          meta: `${p.seats} seats · ${p.full_name}`,
          color: p.color,
          onSelect: () => navigate(`/${s.slug}/results?party=${encodeURIComponent(p.party)}`),
        })
      })
    })
    return out
  }, [states, queries, navigate])

  // Filter by simple case-insensitive substring across label + meta.
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) {
      // Show a curated default: all states + first 8 of each other group.
      const grouped = items.reduce<Record<string, Item[]>>((acc, it) => {
        (acc[it.group] = acc[it.group] ?? []).push(it)
        return acc
      }, {})
      return [
        ...(grouped['States'] ?? []),
        ...(grouped['Constituencies'] ?? []).slice(0, 6),
        ...(grouped['Parties'] ?? []).slice(0, 6),
      ]
    }
    // Multi-token AND match so "kerala bjp" finds BJP rows for Kerala.
    const tokens = query.split(/\s+/)
    return items.filter(it => {
      const hay = `${it.label} ${it.meta ?? ''}`.toLowerCase()
      return tokens.every(t => hay.includes(t))
    }).slice(0, 50)
  }, [items, q])

  // Reset active index whenever the filter changes.
  useEffect(() => { setActive(0) }, [q])

  // Keep the active item in view.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(filtered.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const it = filtered[active]
      if (it) { it.onSelect(); setOpen(false) }
    }
  }

  // Group items for rendering.
  const grouped = filtered.reduce<Record<string, { idx: number; item: Item }[]>>((acc, it, idx) => {
    (acc[it.group] = acc[it.group] ?? []).push({ idx, item: it })
    return acc
  }, {})

  return (
    <div className="cmdk-backdrop" onClick={() => setOpen(false)} role="dialog" aria-label="Command palette">
      <div className="cmdk-shell" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Jump to a state, constituency, or party… (try 'kerala bjp')"
          autoComplete="off"
          spellCheck={false}
        />
        <div ref={listRef} className="cmdk-list">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">No matches. Try a state name, AC number, or party.</div>
          ) : (
            Object.entries(grouped).map(([group, list]) => (
              <div key={group}>
                <div className="cmdk-group">{group}</div>
                {list.map(({ idx, item }) => (
                  <div
                    key={item.key}
                    className="cmdk-item"
                    data-idx={idx}
                    data-active={idx === active}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => { item.onSelect(); setOpen(false) }}
                  >
                    <span className="cmdk-item-icon" style={item.color ? { color: item.color, background: `${item.color}1f` } : undefined}>
                      {item.icon}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    {item.meta && <span className="cmdk-item-meta">{item.meta}</span>}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="cmdk-footer">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> select</span>
          <span><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </div>
  )
}
