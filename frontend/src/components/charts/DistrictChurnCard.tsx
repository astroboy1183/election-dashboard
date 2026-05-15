import { Fragment, useMemo, useState } from 'react'
import { useSortable } from '../../lib/useSortable'
import SortableTh from '../SortableTh'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { fmtIN } from '../../lib/format'

// District-wise churn: per-district seats flipped vs held vs new (for delimitation states).
// Rows are sortable; clicking a row expands an inline panel with flipped/held seat lists.
export function DistrictChurnCard({
  districts, state, expandedDistrict, setExpandedDistrict,
}: {
  districts: any[]; state: string;
  expandedDistrict: string | null; setExpandedDistrict: (n: string | null) => void;
}) {
  const fmt = (n: number) => fmtIN(n)
  // Derive churn fields from district-swing data
  const rows = useMemo(() => districts.map((d: any) => {
    const acs = d.acs ?? []
    const flipped = acs.filter((a: any) => a.flipped).length
    const held = acs.filter((a: any) => a.winner_party_2026 && a.winner_party_2021 && a.winner_party_2026 === a.winner_party_2021).length
    const newSeats = acs.filter((a: any) => a.winner_party_2026 && !a.winner_party_2021).length
    return {
      ...d,
      flipped,
      held,
      new_seats: newSeats,
      churn_pct: d.seats_2026 > 0 ? +(flipped / d.seats_2026 * 100).toFixed(1) : 0,
    }
  }), [districts])
  const { sorted, sort, onSort } = useSortable<any>(rows, { key: 'flipped', dir: 'desc' })
  // Totals across the state for the header
  const total = useMemo(() => rows.reduce((acc: any, r: any) => ({
    seats: acc.seats + r.seats_2026,
    flipped: acc.flipped + r.flipped,
    held: acc.held + r.held,
    new_seats: acc.new_seats + r.new_seats,
  }), { seats: 0, flipped: 0, held: 0, new_seats: 0 }), [rows])
  const hasNew = total.new_seats > 0

  // Pre-collect ALL seats statewide grouped by activity kind (for the chip modals)
  const statewide = useMemo(() => {
    const flipped: any[] = []
    const held: any[] = []
    const fresh: any[] = []
    rows.forEach((r: any) => {
      ;(r.acs ?? []).forEach((a: any) => {
        const enriched = { ...a, district: r.name }
        if (a.flipped) flipped.push(enriched)
        else if (a.winner_party_2026 && a.winner_party_2021 && a.winner_party_2026 === a.winner_party_2021) held.push(enriched)
        else if (a.winner_party_2026 && !a.winner_party_2021) fresh.push(enriched)
      })
    })
    return { flipped, held, fresh }
  }, [rows])

  const [statusModal, setStatusModal] = useState<null | 'flipped' | 'held' | 'new'>(null)
  useEscapeKey(statusModal !== null, () => setStatusModal(null))
  return (
    <div className="card" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 0 }}>District-Wise Churn</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            How many seats changed hands vs stayed put in each district. Click a row to see which seats.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem' }}>
          <button onClick={() => setStatusModal('flipped')}
            title="Show every flipped seat across the state"
            style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer',
                     background: 'rgba(249,115,22,0.10)', color: '#f97316',
                     border: '1px solid rgba(249,115,22,0.30)', fontWeight: 700, fontSize: '0.78rem' }}>
            🔁 {fmt(total.flipped)} flipped →
          </button>
          <button onClick={() => setStatusModal('held')}
            title="Show every held seat across the state"
            style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer',
                     background: 'rgba(34,197,94,0.10)', color: '#22c55e',
                     border: '1px solid rgba(34,197,94,0.30)', fontWeight: 700, fontSize: '0.78rem' }}>
            🔒 {fmt(total.held)} held →
          </button>
          {hasNew && (
            <button onClick={() => setStatusModal('new')}
              title="Show every new (post-delimitation) seat across the state"
              style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer',
                       background: 'rgba(59,130,246,0.10)', color: '#3b82f6',
                       border: '1px solid rgba(59,130,246,0.30)', fontWeight: 700, fontSize: '0.78rem' }}>
              🆕 {fmt(total.new_seats)} new →
            </button>
          )}
        </div>
      </div>
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <table>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
            <tr>
              <SortableTh label="District" sortKey="name" sort={sort} onSort={onSort} />
              <SortableTh label="Seats" sortKey="seats_2026" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="2021 Leader" sortKey="leader_seats_2021" sort={sort} onSort={onSort} />
              <SortableTh label="2026 Leader" sortKey="leader_party" sort={sort} onSort={onSort} />
              <SortableTh label="Flipped" sortKey="flipped" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="Held" sortKey="held" sort={sort} onSort={onSort} align="right" />
              {hasNew && <SortableTh label="New" sortKey="new_seats" sort={sort} onSort={onSort} align="right" />}
              <SortableTh label="Churn %" sortKey="churn_pct" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: any) => {
              const isOpen = expandedDistrict === r.name
              const flippedAcs = (r.acs ?? []).filter((a: any) => a.flipped)
              const heldAcs = (r.acs ?? []).filter((a: any) => a.winner_party_2026 && a.winner_party_2021 && a.winner_party_2026 === a.winner_party_2021)
              const newAcs = (r.acs ?? []).filter((a: any) => a.winner_party_2026 && !a.winner_party_2021)
              // Top "from-party" in flipped seats (whose strongholds got taken)
              const fromCounts: Record<string, { color: string; n: number }> = {}
              flippedAcs.forEach((a: any) => {
                if (!fromCounts[a.winner_party_2021]) fromCounts[a.winner_party_2021] = { color: a.winner_party_2021_color, n: 0 }
                fromCounts[a.winner_party_2021].n += 1
              })
              const topFromList = Object.entries(fromCounts).sort((a, b) => b[1].n - a[1].n)
              // Held grouped by party
              const heldGroups: Record<string, { color: string; acs: any[] }> = {}
              heldAcs.forEach((a: any) => {
                if (!heldGroups[a.winner_party_2026]) heldGroups[a.winner_party_2026] = { color: a.winner_party_2026_color, acs: [] }
                heldGroups[a.winner_party_2026].acs.push(a)
              })
              const heldGroupList = Object.entries(heldGroups).sort((a, b) => b[1].acs.length - a[1].acs.length)
              return (
                <Fragment key={r.name}>
                  <tr
                    onClick={() => setExpandedDistrict(isOpen ? null : r.name)}
                    style={{ cursor: 'pointer', background: isOpen ? 'rgba(99,102,241,0.06)' : undefined }}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--accent)', fontSize: '0.75rem', width: 10 }}>{isOpen ? '▾' : '▸'}</span>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r.seats_2026}</td>
                    <td>
                      {r.leader_seats_2021 > 0 ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {Object.entries((r.party_comparison ?? []).reduce((acc: any, p: any) => { if (p.seats_2021 > 0) acc[p.party] = { color: p.color, n: p.seats_2021 }; return acc }, {})).sort((a: any, b: any) => b[1].n - a[1].n).slice(0, 1).map(([p, info]: any) => (
                            <span key={p}><span style={{ color: info.color, fontWeight: 600 }}>{p}</span> ({info.n})</span>
                          ))}
                        </span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td>
                      {r.leader_party ? (
                        <span style={{ fontSize: '0.82rem' }}>
                          <span style={{ color: r.leader_color, fontWeight: 700 }}>{r.leader_party}</span>
                          <span style={{ color: 'var(--text-secondary)' }}> ({r.leader_seats})</span>
                        </span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.flipped > 0 ? '#f97316' : 'var(--text-secondary)' }}>
                      {r.flipped > 0 ? r.flipped : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.held > 0 ? '#22c55e' : 'var(--text-secondary)' }}>
                      {r.held > 0 ? r.held : '—'}
                    </td>
                    {hasNew && (
                      <td style={{ textAlign: 'right', fontWeight: 700, color: r.new_seats > 0 ? '#3b82f6' : 'var(--text-secondary)' }}>
                        {r.new_seats > 0 ? r.new_seats : '—'}
                      </td>
                    )}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        fontWeight: 700, fontSize: '0.85rem',
                        color: r.churn_pct >= 50 ? '#ef4444' : r.churn_pct >= 25 ? '#f59e0b' : r.churn_pct > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}>
                        {r.churn_pct}%
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={hasNew ? 8 : 7} style={{ background: 'var(--bg-secondary)', padding: '1rem 1.25rem', borderTop: '1px dashed var(--border)' }}>
                        <div className="col-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                          {/* Flipped */}
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 6 }}>
                              🔁 Flipped ({flippedAcs.length})
                            </div>
                            {flippedAcs.length === 0 ? (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No flips here.</div>
                            ) : (
                              <>
                                {topFromList.length > 0 && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    Strongholds lost: {topFromList.map(([p, info]) => (
                                      <span key={p} style={{ marginRight: 8 }}>
                                        <span style={{ color: info.color, fontWeight: 700 }}>{p}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}> ×{info.n}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
                                  {flippedAcs.sort((a: any, b: any) => b.margin_2026 - a.margin_2026).map((a: any) => (
                                    <div key={a.ac_number}
                                      onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '0.3rem 0.5rem', borderRadius: 5, cursor: 'pointer',
                                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                                      }}>
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: 36 }}>AC#{a.ac_number}</span>
                                      <span style={{ fontWeight: 600, fontSize: '0.78rem', flex: 1 }}>{a.name}</span>
                                      <span style={{ color: a.winner_party_2021_color, fontWeight: 600, fontSize: '0.72rem' }}>{a.winner_party_2021}</span>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>→</span>
                                      <span style={{ color: a.winner_party_2026_color, fontWeight: 700, fontSize: '0.75rem' }}>{a.winner_party_2026}</span>
                                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', minWidth: 50, textAlign: 'right' }}>+{fmt(a.margin_2026)}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          {/* Held + New */}
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 6 }}>
                              🔒 Held ({heldAcs.length})
                            </div>
                            {heldGroupList.length === 0 ? (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No carryover wins from 2021.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: hasNew && newAcs.length > 0 ? 220 : 320, overflowY: 'auto' }}>
                                {heldGroupList.map(([p, info]) => (
                                  <div key={p} style={{ border: `1px solid ${info.color}44`, borderRadius: 6, padding: '0.5rem 0.65rem', background: `${info.color}0c` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: info.color }}>{p}</span>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{info.acs.length} held</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      {info.acs.sort((a: any, b: any) => b.margin_2026 - a.margin_2026).map((a: any) => (
                                        <div key={a.ac_number}
                                          onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '0.25rem 0.45rem', borderRadius: 5, cursor: 'pointer',
                                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                                          }}>
                                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: 38 }}>AC#{a.ac_number}</span>
                                          <span style={{ fontWeight: 600, fontSize: '0.76rem', flex: 1 }}>{a.name}</span>
                                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#22c55e', minWidth: 60, textAlign: 'right' }}>
                                            +{fmt(a.margin_2026)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {hasNew && newAcs.length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: '0.72rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 4 }}>
                                  🆕 New (Post-Delimitation) ({newAcs.length})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {newAcs.sort((a: any, b: any) => a.ac_number - b.ac_number).map((a: any) => (
                                    <span key={a.ac_number}
                                      onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
                                      style={{
                                        padding: '0.15rem 0.4rem', borderRadius: 4, fontSize: '0.68rem', cursor: 'pointer',
                                        background: 'rgba(59,130,246,0.10)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.30)',
                                      }}>
                                      <span style={{ opacity: 0.65, marginRight: 3 }}>AC#{a.ac_number}</span>{a.name}{' '}
                                      <span style={{ color: a.winner_party_2026_color }}>→ {a.winner_party_2026}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Statewide breakdown modal — opened by clicking flipped / held / new chips */}
      {statusModal && (
        <ChurnStatusModal
          kind={statusModal}
          seats={statusModal === 'flipped' ? statewide.flipped : statusModal === 'held' ? statewide.held : statewide.fresh}
          state={state}
          onClose={() => setStatusModal(null)}
        />
      )}
    </div>
  )
}

// Modal showing all seats statewide of a given activity kind (flipped / held / new).
// Seats are grouped:
//   flipped → grouped by from→to party flow
//   held    → grouped by the party that held them
//   new     → grouped by the 2026 winning party
function ChurnStatusModal({
  kind, seats, state, onClose,
}: {
  kind: 'flipped' | 'held' | 'new'
  seats: any[]
  state: string
  onClose: () => void
}) {
  useEscapeKey(true, onClose)
  const fmt = (n: number) => fmtIN(n)
  const meta = {
    flipped: { label: 'Flipped Seats', emoji: '🔁', accent: '#f97316',
               sub: 'Seats where a different party won in 2026 than in 2021.' },
    held:    { label: 'Held Seats',    emoji: '🔒', accent: '#22c55e',
               sub: 'Seats where the same party won in both 2021 and 2026.' },
    new:     { label: 'New (Post-Delimitation) Seats', emoji: '🆕', accent: '#3b82f6',
               sub: 'Seats that didn\'t exist in 2021 — created by 2023 redistricting.' },
  }[kind]

  // Group seats based on kind
  const groups = useMemo(() => {
    const m: Record<string, { key: string; label: string; color: string; sub: string; acs: any[] }> = {}
    seats.forEach(a => {
      let key: string, label: string, color: string, sub: string
      if (kind === 'flipped') {
        key = `${a.winner_party_2021}→${a.winner_party_2026}`
        label = `${a.winner_party_2021} → ${a.winner_party_2026}`
        color = a.winner_party_2026_color
        sub = ''
      } else if (kind === 'held') {
        key = a.winner_party_2026
        label = a.winner_party_2026
        color = a.winner_party_2026_color
        sub = 'held in both 2021 and 2026'
      } else {
        key = a.winner_party_2026
        label = a.winner_party_2026
        color = a.winner_party_2026_color
        sub = 'newly contested seats won'
      }
      if (!m[key]) m[key] = { key, label, color, sub, acs: [] }
      m[key].acs.push(a)
    })
    return Object.values(m).sort((a, b) => b.acs.length - a.acs.length)
  }, [seats, kind])

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '4vh 1rem', zIndex: 50, overflowY: 'auto',
      }}>
      <div onClick={e => e.stopPropagation()} className="card"
        style={{ maxWidth: 900, width: '100%', borderLeft: `4px solid ${meta.accent}`, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              <span style={{ marginRight: 6 }}>{meta.emoji}</span>{meta.label}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: meta.accent }}>
              {fmt(seats.length)} {seats.length === 1 ? 'seat' : 'seats'} statewide
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>{meta.sub}</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                     borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem' }}>Close ✕</button>
        </div>

        {groups.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem', fontStyle: 'italic' }}>
            No seats in this category.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map(g => (
              <div key={g.key} style={{ border: `1px solid ${g.color}44`, borderRadius: 8, padding: '0.7rem 0.9rem', background: `${g.color}0c` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: g.color }}>{g.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {g.acs.length} {g.acs.length === 1 ? 'seat' : 'seats'}{g.sub ? ` · ${g.sub}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {g.acs.sort((a: any, b: any) => b.margin_2026 - a.margin_2026).map((a: any) => (
                    <div key={`${a.district}-${a.ac_number}`}
                      onClick={() => window.open(`/${state}/constituencies/${a.ac_number}`, '_blank')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0.35rem 0.55rem', borderRadius: 5, cursor: 'pointer',
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                      }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 38 }}>AC#{a.ac_number}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem', flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 110 }}>{a.district}</span>
                      {kind === 'flipped' && (
                        <span style={{ fontSize: '0.72rem' }}>
                          <span style={{ color: a.winner_party_2021_color, fontWeight: 600 }}>{a.winner_party_2021}</span>
                          <span style={{ color: 'var(--text-secondary)', margin: '0 5px' }}>→</span>
                          <span style={{ color: a.winner_party_2026_color, fontWeight: 700 }}>{a.winner_party_2026}</span>
                        </span>
                      )}
                      <span style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 700, minWidth: 70, textAlign: 'right' }}>
                        +{fmt(a.margin_2026)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic',
                      padding: '0.5rem 0.7rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
          Click any seat to open its constituency detail in a new tab.
        </div>
      </div>
    </div>
  )
}
