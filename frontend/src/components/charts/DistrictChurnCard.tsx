import { Fragment, useMemo, useState } from 'react'
import { useSortable } from '../../lib/useSortable'
import SortableTh from '../SortableTh'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { fmtIN } from '../../lib/format'

// Per-area churn: seats flipped vs held vs new in each area (district or LS seat).
// Rows are sortable; clicking a row expands an inline panel with flipped/held seat lists.
// Same component powers two views — pass title/subtitle/columnLabel to rebrand.
export function DistrictChurnCard({
  districts, state, expandedDistrict, setExpandedDistrict,
  title = 'District-Wise Churn',
  subtitle = 'How many seats changed hands vs stayed put in each district. Click a row to see which seats.',
  columnLabel = 'District',
  prevLabel = '2021 Leader',
  prevLabelShort = '2021',  // shown in the expand-row "Strongholds lost" caption
  groupNoun = 'district',   // used in narrative ("12 districts saw…")
}: {
  districts: any[]; state: string;
  expandedDistrict: string | null; setExpandedDistrict: (n: string | null) => void;
  title?: string; subtitle?: string;
  columnLabel?: string;
  prevLabel?: string;       // header for the previous-period leader column
  prevLabelShort?: string;  // short variant for drill-down captions
  groupNoun?: string;       // singular noun used in narrative ("district", "Lok Sabha seat")
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

  // Per-row derived signal: did the top party in 2026 differ from the top
  // party in the baseline year? Drives the "Leadership" badge column.
  const enrichedRows = useMemo(() => rows.map((r: any) => {
    const top2021 = (r.party_comparison ?? [])
      .filter((p: any) => p.seats_2021 > 0)
      .sort((a: any, b: any) => b.seats_2021 - a.seats_2021)[0]
    const prevParty = top2021?.party ?? null
    const newParty = r.leader_party ?? null
    const leadershipChanged = !!(prevParty && newParty && prevParty !== newParty)
    const isFresh = !!(newParty && !prevParty)
    return { ...r, prevParty, prevPartyColor: top2021?.color, newParty, leadershipChanged, isFresh }
  }), [rows])

  // Narrative summary: "12 districts saw new leadership; BJP gained 9, AITC kept 11"
  const narrative = useMemo(() => {
    const changedRows = enrichedRows.filter(r => r.leadershipChanged)
    const heldRows = enrichedRows.filter(r => !r.leadershipChanged && !r.isFresh && r.newParty)
    const freshRows = enrichedRows.filter(r => r.isFresh)
    // Who gained / who retained
    const gainedBy: Record<string, { color: string; n: number }> = {}
    changedRows.forEach(r => {
      if (!gainedBy[r.newParty]) gainedBy[r.newParty] = { color: r.leader_color, n: 0 }
      gainedBy[r.newParty].n += 1
    })
    const retainedBy: Record<string, { color: string; n: number }> = {}
    heldRows.forEach(r => {
      if (!retainedBy[r.newParty]) retainedBy[r.newParty] = { color: r.leader_color, n: 0 }
      retainedBy[r.newParty].n += 1
    })
    return {
      changedCount: changedRows.length,
      heldCount: heldRows.length,
      freshCount: freshRows.length,
      gainedBy: Object.entries(gainedBy).map(([p, v]) => ({ party: p, ...v })).sort((a, b) => b.n - a.n),
      retainedBy: Object.entries(retainedBy).map(([p, v]) => ({ party: p, ...v })).sort((a, b) => b.n - a.n),
    }
  }, [enrichedRows])

  // Re-sort the enriched array using the same sort key/dir as the original sortable
  const sortedEnriched = useMemo(() => {
    const m: Record<string, any> = {}
    enrichedRows.forEach(r => { m[r.name] = r })
    return sorted.map((r: any) => m[r.name] ?? r)
  }, [sorted, enrichedRows])

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
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div>
            <div className="section-title" style={{ marginBottom: 0 }}>{title}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {subtitle}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem' }}>
            <button onClick={() => setStatusModal('held')}
              title="Show every seat the same party held in both elections"
              style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer',
                       background: 'rgba(34,197,94,0.10)', color: '#22c55e',
                       border: '1px solid rgba(34,197,94,0.30)', fontWeight: 700, fontSize: '0.78rem' }}>
              {fmt(total.held)} same-party seats →
            </button>
            <button onClick={() => setStatusModal('flipped')}
              title="Show every seat where the winning party changed"
              style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer',
                       background: 'rgba(249,115,22,0.10)', color: '#f97316',
                       border: '1px solid rgba(249,115,22,0.30)', fontWeight: 700, fontSize: '0.78rem' }}>
              {fmt(total.flipped)} flipped seats →
            </button>
            {hasNew && (
              <button onClick={() => setStatusModal('new')}
                title="Show every brand-new seat created by 2023 delimitation"
                style={{ padding: '0.3rem 0.65rem', borderRadius: 6, cursor: 'pointer',
                         background: 'rgba(59,130,246,0.10)', color: '#3b82f6',
                         border: '1px solid rgba(59,130,246,0.30)', fontWeight: 700, fontSize: '0.78rem' }}>
                {fmt(total.new_seats)} new seats →
              </button>
            )}
          </div>
        </div>

        {/* Plain-English narrative summary — the "what happened" sentence */}
        {(narrative.changedCount > 0 || narrative.heldCount > 0) && (
          <div style={{
            fontSize: '0.82rem', color: 'var(--text-primary)',
            padding: '0.6rem 0.85rem', borderRadius: 8,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            lineHeight: 1.55,
          }}>
            <strong>{narrative.changedCount}</strong> {narrative.changedCount === 1 ? `${groupNoun} saw` : `${groupNoun}s saw`} a leadership change
            {narrative.gainedBy.length > 0 && <> — gained by{' '}
              {narrative.gainedBy.map((g, i) => (
                <span key={g.party}>
                  <span style={{ color: g.color, fontWeight: 700 }}>{g.party}</span>
                  <span style={{ color: 'var(--text-secondary)' }}> ({g.n})</span>
                  {i < narrative.gainedBy.length - 1 && ', '}
                </span>
              ))}
            </>}
            {narrative.heldCount > 0 && <>. <strong>{narrative.heldCount}</strong> {narrative.heldCount === 1 ? `${groupNoun} kept` : `${groupNoun}s kept`} their 2021 leader
              {narrative.retainedBy.length > 0 && <> — held by{' '}
                {narrative.retainedBy.map((g, i) => (
                  <span key={g.party}>
                    <span style={{ color: g.color, fontWeight: 700 }}>{g.party}</span>
                    <span style={{ color: 'var(--text-secondary)' }}> ({g.n})</span>
                    {i < narrative.retainedBy.length - 1 && ', '}
                  </span>
                ))}
              </>}
            </>}
            {narrative.freshCount > 0 && <>. <strong>{narrative.freshCount}</strong> {narrative.freshCount === 1 ? `${groupNoun} is` : `${groupNoun}s are`} new (post-delimitation, no 2021 baseline)</>}
            .
          </div>
        )}
      </div>
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <table>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
            <tr>
              <SortableTh label={columnLabel} sortKey="name" sort={sort} onSort={onSort} />
              <SortableTh label="Seats" sortKey="seats_2026" sort={sort} onSort={onSort} align="right" />
              <SortableTh label={prevLabel} sortKey="leader_seats_2021" sort={sort} onSort={onSort} />
              <SortableTh label="2026 Leader" sortKey="leader_party" sort={sort} onSort={onSort} />
              <th style={{ textAlign: 'left' }}>
                <span title="Green = same party kept the seat. Orange = winning party changed. Blue = new seat (post-delimitation).">
                  Seat-level change
                </span>
              </th>
              <SortableTh label="Churn %" sortKey="churn_pct" sort={sort} onSort={onSort} align="right" />
              <th style={{ textAlign: 'center' }}>
                <span title="Did the top party in this area change between elections?">
                  Leadership
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedEnriched.map((r: any) => {
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
                      {(() => {
                        // Actual top 2021 party in this group — NOT gated on
                        // whether the 2026 leader had wins in 2021. Otherwise a
                        // clean sweep (BJP=0 in 2021) would hide AITC's 2021
                        // dominance and render "—".
                        const top2021 = (r.party_comparison ?? [])
                          .filter((p: any) => p.seats_2021 > 0)
                          .sort((a: any, b: any) => b.seats_2021 - a.seats_2021)[0]
                        return top2021 ? (
                          <span style={{ fontSize: '0.82rem' }}>
                            <span style={{ color: top2021.color, fontWeight: 700 }}>{top2021.party}</span>
                            <span style={{ color: 'var(--text-secondary)' }}> ({top2021.seats_2021})</span>
                          </span>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      })()}
                    </td>
                    <td>
                      {r.leader_party ? (
                        <span style={{ fontSize: '0.82rem' }}>
                          <span style={{ color: r.leader_color, fontWeight: 700 }}>{r.leader_party}</span>
                          <span style={{ color: 'var(--text-secondary)' }}> ({r.leader_seats})</span>
                        </span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td>
                      {/* Visual change bar: green = held, orange = flipped, blue = new */}
                      {r.seats_2026 > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                          <div title={`${r.held} same-party · ${r.flipped} flipped${r.new_seats ? ` · ${r.new_seats} new` : ''}`}
                            style={{
                              display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden',
                              background: 'var(--bg-secondary)', flex: 1, minWidth: 100,
                              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                            }}>
                            {r.held > 0 && (
                              <div style={{
                                width: `${(r.held / r.seats_2026) * 100}%`, background: '#22c55e',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.7rem', fontWeight: 700, color: '#0b1020',
                              }}>{(r.held / r.seats_2026) >= 0.12 ? r.held : ''}</div>
                            )}
                            {r.flipped > 0 && (
                              <div style={{
                                width: `${(r.flipped / r.seats_2026) * 100}%`, background: '#f97316',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.7rem', fontWeight: 700, color: '#0b1020',
                              }}>{(r.flipped / r.seats_2026) >= 0.12 ? r.flipped : ''}</div>
                            )}
                            {r.new_seats > 0 && (
                              <div style={{
                                width: `${(r.new_seats / r.seats_2026) * 100}%`, background: '#3b82f6',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.7rem', fontWeight: 700, color: '#0b1020',
                              }}>{(r.new_seats / r.seats_2026) >= 0.12 ? r.new_seats : ''}</div>
                            )}
                          </div>
                          <span className="tabular" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#22c55e', fontWeight: 700 }}>{r.held}</span>
                            <span style={{ margin: '0 2px' }}>/</span>
                            <span style={{ color: '#f97316', fontWeight: 700 }}>{r.flipped}</span>
                            {hasNew && r.new_seats > 0 && (
                              <>
                                <span style={{ margin: '0 2px' }}>/</span>
                                <span style={{ color: '#3b82f6', fontWeight: 700 }}>{r.new_seats}</span>
                              </>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        fontWeight: 700, fontSize: '0.85rem',
                        color: r.churn_pct >= 50 ? '#ef4444' : r.churn_pct >= 25 ? '#f59e0b' : r.churn_pct > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                        title={`${r.flipped} of ${r.seats_2026} seats changed party (${r.churn_pct}%)`}>
                        {r.churn_pct}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {/* "Did the top party change?" status badge — the single
                          clearest signal of what happened in this area. */}
                      {r.leadershipChanged ? (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 800, padding: '0.18rem 0.55rem',
                          borderRadius: 12, background: 'rgba(249,115,22,0.15)', color: '#f97316',
                          border: '1px solid rgba(249,115,22,0.40)', whiteSpace: 'nowrap',
                        }}
                          title={`Top party changed: ${r.prevParty} → ${r.newParty}`}>
                          <span style={{ color: r.prevPartyColor, fontWeight: 700 }}>{r.prevParty}</span>
                          {' → '}
                          <span style={{ color: r.leader_color, fontWeight: 800 }}>{r.newParty}</span>
                        </span>
                      ) : r.isFresh ? (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 800, padding: '0.18rem 0.55rem',
                          borderRadius: 12, background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                          border: '1px solid rgba(59,130,246,0.30)', whiteSpace: 'nowrap',
                        }}
                          title="New area created by post-2023 delimitation — no 2021 baseline">
                          🆕 New
                        </span>
                      ) : r.newParty ? (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 800, padding: '0.18rem 0.55rem',
                          borderRadius: 12, background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                          border: '1px solid rgba(34,197,94,0.30)', whiteSpace: 'nowrap',
                        }}
                          title={`${r.newParty} retained leadership across both elections`}>
                          ✓ <span style={{ color: r.leader_color, fontWeight: 800 }}>{r.newParty}</span> held
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--bg-secondary)', padding: '1rem 1.25rem', borderTop: '1px dashed var(--border)' }}>
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
                                    {prevLabelShort} leaders lost ground: {topFromList.map(([p, info]) => (
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
