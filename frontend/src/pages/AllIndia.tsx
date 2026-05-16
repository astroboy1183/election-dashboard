/**
 * All-India Analytics — cross-state deep-dive page.
 *
 * Holds the dense cross-state sections that were originally on the Home page:
 *   1. Top parties by MLA count (with 2026 vs 2021 deltas)
 *   2. NOTA — voter dissatisfaction, with clickable per-state badges
 *   3. Postal Ballots — Institutional Voter Analysis (this cycle + 2021→2026 swing)
 *
 * Home keeps the at-a-glance "what kind of legislature" tiles + a CTA card that
 * links here. Modals for NOTA / Postal-leads / Postal-swing live on this page now.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardSummary, usePostalLeads, usePostalSwing } from '../lib/api'
import { useEscapeKey } from '../lib/useEscapeKey'
import { fmtIN } from '../lib/format'

export default function AllIndia() {
  const navigate = useNavigate()
  const { data: summary } = useDashboardSummary()
  const { data: postal } = usePostalLeads()
  const { data: postalSwing } = usePostalSwing()

  const [notaModalState, setNotaModalState] = useState<string | null>(null)
  const [postalModalState, setPostalModalState] = useState<string | null>(null)
  const [swingModalState, setSwingModalState] = useState<string | null>(null)
  useEscapeKey(notaModalState !== null, () => setNotaModalState(null))
  useEscapeKey(postalModalState !== null, () => setPostalModalState(null))
  useEscapeKey(swingModalState !== null, () => setSwingModalState(null))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
            borderRadius: 8, padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.78rem', marginBottom: '0.75rem',
          }}>
          ← Home
        </button>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>📊 All-India Analytics</h1>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          Cross-state deep-dive — top parties, NOTA dissatisfaction, postal ballot leads, institutional voter swings since 2021.
        </div>
      </div>

      {/* ─────────────  Top parties by MLA count  ───────────── */}
      {summary && summary.top_parties.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-title">Biggest parties by MLA count (all 5 states combined)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: '0.62rem', color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
              marginBottom: 2,
            }}>
              <span style={{ width: 60 }}>Party</span>
              <span style={{ flex: 1 }}></span>
              <span style={{ width: 70, textAlign: 'right' }}>2026</span>
              <span style={{ width: 50, textAlign: 'right' }}>%</span>
              <span style={{ width: 70, textAlign: 'right' }} title="Change vs 2021">vs 2021</span>
            </div>
            {summary.top_parties.map(p => {
              const deltaColor = p.delta > 0 ? '#22c55e' : p.delta < 0 ? '#ef4444' : 'var(--text-secondary)'
              const deltaSign = p.delta > 0 ? '+' : ''
              return (
                <div key={p.party} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 60, fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{p.party}</span>
                  <div style={{ flex: 1, height: 18, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(1, (p.pct / (summary.top_parties[0].pct || 1)) * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--accent) 0%, var(--accent-cyan) 100%)',
                      borderRadius: 4,
                    }} />
                  </div>
                  <span className="tabular" style={{ width: 70, textAlign: 'right', fontWeight: 700 }}>{p.seats}</span>
                  <span className="tabular" style={{ width: 50, textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.pct}%</span>
                  <span
                    className="tabular"
                    style={{ width: 70, textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: deltaColor }}
                    title={`2021: ${p.seats_2021} seats → 2026: ${p.seats} seats (${deltaSign}${p.delta})`}
                  >
                    {deltaSign}{p.delta}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─────────────  NOTA — voter dissatisfaction  ───────────── */}
      {summary?.nota_by_state && summary.nota_by_state.some(n => n.total_nota > 0) && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-title">🗳️ NOTA — voter dissatisfaction</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <span className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>
                {summary.total_nota_votes_all_states.toLocaleString('en-IN')}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: 6 }}>NOTA votes across all 5 states</span>
            </div>
            {summary.total_nota_decided_seats_all_states > 0 && (
              <div style={{
                padding: '0.25rem 0.65rem', borderRadius: 999,
                background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.45)',
                color: '#fbbf24', fontWeight: 700, fontSize: '0.82rem',
              }}>
                ⚠ {summary.total_nota_decided_seats_all_states} seats where NOTA exceeded the winning margin
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {summary.nota_by_state.slice().sort((a, b) => b.share_pct - a.share_pct).map(n => (
              <div key={n.state} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 100, fontWeight: 700, fontSize: '0.82rem' }}>{n.name}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(2, (n.share_pct / Math.max(...summary.nota_by_state.map(x => x.share_pct), 0.001)) * 100)}%`,
                    height: '100%', background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)', borderRadius: 3,
                  }} />
                </div>
                <span className="tabular" style={{ width: 60, textAlign: 'right', fontWeight: 700, fontSize: '0.82rem' }}>{n.share_pct}%</span>
                <span className="tabular" style={{ width: 80, textAlign: 'right', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  {n.total_nota.toLocaleString('en-IN')}
                </span>
                {n.decided_count > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => setNotaModalState(n.state)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNotaModalState(n.state) } }}
                    style={{
                      fontSize: '0.66rem', fontWeight: 800, color: '#f87171',
                      padding: '0.1rem 0.4rem', borderRadius: 4,
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                    title={`Click to see the ${n.decided_count} seat${n.decided_count === 1 ? '' : 's'} in ${n.name} where NOTA exceeded the winning margin`}
                  >
                    ⚠ {n.decided_count}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────  Postal Ballots block  ───────────── */}
      {(postal || postalSwing) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.7rem', color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800,
            padding: '0 0.1rem 0.5rem', display: 'flex', alignItems: 'baseline', gap: 10,
          }}>
            <span>📬 Postal Ballots — Institutional Voter Analysis</span>
            <span style={{ fontSize: '0.62rem', textTransform: 'none', letterSpacing: '0.02em', color: 'var(--text-secondary)', opacity: 0.7, fontWeight: 500 }}>
              Postal cohort = govt employees, soldiers, polling staff.
            </span>
          </div>
          {postal && (
            <div className="card" style={{ marginBottom: '0.6rem', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div className="section-title" style={{ marginBottom: 2 }}>This cycle (2026) — who postal voters backed</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong className="tabular" style={{ color: '#a78bfa' }}>{fmtIN(postal.grand_total_postal)}</strong> postal votes cast across all 5 states
                    ({(postal.grand_total_postal / postal.grand_total_polled * 100).toFixed(2)}% of total polled).
                  </div>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
                  Click any state for full per-party breakdown
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {postal.states.map(s => {
                  if (!s.top_over_performer || !s.top_under_performer) return null
                  const over = s.top_over_performer
                  const under = s.top_under_performer
                  const postalLeaderByCount = [...s.parties].sort((a, b) => b.postal_seats_led - a.postal_seats_led)[0]
                  const showSeatLine = postalLeaderByCount
                    && postalLeaderByCount.postal_seats_led > 0
                    && Math.abs(postalLeaderByCount.seat_delta) >= 5
                  return (
                    <div
                      key={s.state}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPostalModalState(s.state)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPostalModalState(s.state) } }}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: '0.7rem 0.9rem', borderRadius: 8,
                        background: 'var(--bg-secondary)', cursor: 'pointer',
                        border: '1px solid var(--border)',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      title={`See the full per-party postal breakdown for ${s.name}`}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 12, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{s.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {fmtIN(s.postal_total)} postal · {s.postal_share_of_polled}% of polled
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            padding: '0.15rem 0.55rem', borderRadius: 999,
                            background: 'rgba(34,197,94,0.13)', border: '1px solid rgba(34,197,94,0.4)',
                            color: '#86efac', fontWeight: 800, fontSize: '0.74rem',
                          }}>▲ {over.party}</span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            postal <strong style={{ color: '#22c55e' }}>{over.postal_share_pct.toFixed(1)}%</strong> vs EVM {over.evm_share_pct.toFixed(1)}%
                          </span>
                          <span className="tabular" style={{ fontWeight: 800, color: '#22c55e', fontSize: '0.82rem' }}>
                            +{over.delta_pp.toFixed(1)} pp
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            padding: '0.15rem 0.55rem', borderRadius: 999,
                            background: 'rgba(239,68,68,0.13)', border: '1px solid rgba(239,68,68,0.4)',
                            color: '#fca5a5', fontWeight: 800, fontSize: '0.74rem',
                          }}>▼ {under.party}</span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            postal <strong style={{ color: '#ef4444' }}>{under.postal_share_pct.toFixed(1)}%</strong> vs EVM {under.evm_share_pct.toFixed(1)}%
                          </span>
                          <span className="tabular" style={{ fontWeight: 800, color: '#ef4444', fontSize: '0.82rem' }}>
                            {under.delta_pp.toFixed(1)} pp
                          </span>
                        </div>
                      </div>
                      {showSeatLine && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingLeft: '0.1rem', marginTop: 2 }}>
                          🏛️ <strong style={{ color: 'var(--text-primary)' }}>{postalLeaderByCount.party}</strong>
                          {' '}led postal in <strong className="tabular" style={{ color: '#a78bfa' }}>{postalLeaderByCount.postal_seats_led}</strong> seats,
                          won <strong className="tabular">{postalLeaderByCount.seats_won}</strong> overall
                          {' '}
                          <span style={{ color: postalLeaderByCount.seat_delta > 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                            ({postalLeaderByCount.seat_delta > 0 ? '+' : ''}{postalLeaderByCount.seat_delta})
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                💡 A party over-performing in postal often signals appeal among the bureaucratic/institutional class.
              </div>
            </div>
          )}

          {postalSwing && (
            <div className="card" style={{ borderLeft: '4px solid #06b6d4' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div className="section-title" style={{ marginBottom: 2 }}>Since last cycle (2021 → 2026) — how institutional voters shifted</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Did the postal cohort move toward different parties between elections?
                  </div>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
                  Click any state for full party-by-party breakdown
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {postalSwing.states.map(s => {
                  if (!s.top_gainer || !s.top_loser) return null
                  const g = s.top_gainer; const l = s.top_loser
                  const sg = s.top_seat_gainer; const sl = s.top_seat_loser
                  return (
                    <div
                      key={s.state}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSwingModalState(s.state)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSwingModalState(s.state) } }}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: '0.7rem 0.9rem', borderRadius: 8,
                        background: 'var(--bg-secondary)', cursor: 'pointer',
                        border: '1px solid var(--border)',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      title={`See the full per-party 2021→2026 postal swing for ${s.name}`}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 12, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{s.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {fmtIN(s.postal_total_2021)} → {fmtIN(s.postal_total_2026)} postal
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            padding: '0.15rem 0.55rem', borderRadius: 999,
                            background: 'rgba(34,197,94,0.13)', border: '1px solid rgba(34,197,94,0.4)',
                            color: '#86efac', fontWeight: 800, fontSize: '0.74rem',
                          }}>▲ {g.party}</span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            2021 <strong>{g.share_2021_pct.toFixed(1)}%</strong> → 2026 <strong style={{ color: '#22c55e' }}>{g.share_2026_pct.toFixed(1)}%</strong>
                          </span>
                          <span className="tabular" style={{ fontWeight: 800, color: '#22c55e', fontSize: '0.82rem' }}>
                            +{g.swing_pp.toFixed(1)} pp
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            padding: '0.15rem 0.55rem', borderRadius: 999,
                            background: 'rgba(239,68,68,0.13)', border: '1px solid rgba(239,68,68,0.4)',
                            color: '#fca5a5', fontWeight: 800, fontSize: '0.74rem',
                          }}>▼ {l.party}</span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            2021 <strong>{l.share_2021_pct.toFixed(1)}%</strong> → 2026 <strong style={{ color: '#ef4444' }}>{l.share_2026_pct.toFixed(1)}%</strong>
                          </span>
                          <span className="tabular" style={{ fontWeight: 800, color: '#ef4444', fontSize: '0.82rem' }}>
                            {l.swing_pp.toFixed(1)} pp
                          </span>
                        </div>
                      </div>
                      {sg && sl && (sg.seat_swing !== 0 || sl.seat_swing !== 0) && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          fontSize: '0.72rem', color: 'var(--text-secondary)',
                          paddingLeft: '0.1rem',
                        }}>
                          <span>🏛️ Postal-leader ACs:</span>
                          <span>
                            <strong style={{ color: 'var(--text-primary)' }}>{sg.party}</strong>
                            {' '}<span className="tabular">{sg.seats_led_2021}</span>
                            {' → '}<strong className="tabular" style={{ color: '#22c55e' }}>{sg.seats_led_2026}</strong>
                            {' '}<span style={{ color: '#22c55e', fontWeight: 700 }}>
                              ({sg.seat_swing > 0 ? '+' : ''}{sg.seat_swing})
                            </span>
                          </span>
                          <span style={{ opacity: 0.5 }}>·</span>
                          <span>
                            <strong style={{ color: 'var(--text-primary)' }}>{sl.party}</strong>
                            {' '}<span className="tabular">{sl.seats_led_2021}</span>
                            {' → '}<strong className="tabular" style={{ color: '#ef4444' }}>{sl.seats_led_2026}</strong>
                            {' '}<span style={{ color: '#ef4444', fontWeight: 700 }}>
                              ({sl.seat_swing})
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                📂 2021 data parsed from ECI's official Statistical Reports for each state.
                Coverage is ~95% (some fringe Independent rows may be missing due to PDF layout quirks).
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────  Modals  ───────────── */}
      {/* NOTA-decided seats modal */}
      {notaModalState && summary?.nota_by_state && (() => {
        const stateInfo = summary.nota_by_state.find(n => n.state === notaModalState)
        if (!stateInfo) return null
        return (
          <div
            onClick={() => setNotaModalState(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(7, 9, 26, 0.78)',
              backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex',
              alignItems: 'flex-start', justifyContent: 'center',
              padding: '4rem 1rem 2rem', overflowY: 'auto', animation: 'fadeInUp 0.25s ease-out',
            }}
          >
            <div
              className="card"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 720, width: '100%', borderLeft: '4px solid #f87171', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    NOTA-Decided Seats · {stateInfo.name}
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171' }}>
                    {stateInfo.decided_count} seat{stateInfo.decided_count === 1 ? '' : 's'} where NOTA &gt; winning margin
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Sorted by how NOTA-decided each contest was (NOTA ÷ margin, descending).
                  </div>
                </div>
                <button
                  onClick={() => setNotaModalState(null)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                    borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >Close ✕</button>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>AC</th>
                      <th>Winner</th>
                      <th style={{ textAlign: 'right' }}>Margin</th>
                      <th style={{ textAlign: 'right' }}>NOTA</th>
                      <th style={{ textAlign: 'right' }}>NOTA / Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateInfo.decided_seats.map((s, i) => {
                      const ratio = s.nota_votes / Math.max(s.margin, 1)
                      return (
                        <tr
                          key={s.ac_number}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setNotaModalState(null)
                            navigate(`/${notaModalState}/constituencies/${s.ac_number}`)
                          }}
                          title={`Open ${s.ac_name} drilldown`}
                        >
                          <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.ac_name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              AC-{s.ac_number} · {s.district}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.winner}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.party}</div>
                          </td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtIN(s.margin)}</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>{fmtIN(s.nota_votes)}</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700, color: '#f87171' }}>
                            {ratio >= 100 ? `${ratio.toFixed(0)}×` : `${ratio.toFixed(1)}×`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                💡 A high <strong>NOTA / Margin</strong> ratio means NOTA voters outnumbered the margin of victory.
                Click any row to drill into that constituency.
              </div>
            </div>
          </div>
        )
      })()}

      {/* Postal modal */}
      {postalModalState && postal && (() => {
        const s = postal.states.find(x => x.state === postalModalState)
        if (!s) return null
        return (
          <div
            onClick={() => setPostalModalState(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(7,9,26,0.78)', backdropFilter: 'blur(6px)',
              zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              padding: '4rem 1rem 2rem', overflowY: 'auto', animation: 'fadeInUp 0.25s ease-out',
            }}
          >
            <div
              className="card"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 760, width: '100%', borderLeft: '4px solid #8b5cf6', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    Postal Ballot Breakdown · {s.name}
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a78bfa' }}>
                    {fmtIN(s.postal_total)} postal votes ({s.postal_share_of_polled}% of state polled)
                  </div>
                </div>
                <button
                  onClick={() => setPostalModalState(null)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                    borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >Close ✕</button>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Party</th>
                      <th style={{ textAlign: 'right' }}>Postal</th>
                      <th style={{ textAlign: 'right' }}>Postal %</th>
                      <th style={{ textAlign: 'right' }}>EVM %</th>
                      <th style={{ textAlign: 'right' }}>Δ pp</th>
                      <th style={{ textAlign: 'right' }}>Postal Seats</th>
                      <th style={{ textAlign: 'right' }}>Wins</th>
                      <th style={{ textAlign: 'right' }}>Δ seats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...s.parties].sort((a, b) => b.postal_share_pct - a.postal_share_pct).map(p => {
                      const ppColor = p.delta_pp > 0 ? '#22c55e' : p.delta_pp < 0 ? '#ef4444' : 'var(--text-secondary)'
                      const ppSign = p.delta_pp > 0 ? '+' : ''
                      const seatColor = p.seat_delta > 0 ? '#22c55e' : p.seat_delta < 0 ? '#ef4444' : 'var(--text-secondary)'
                      const seatSign = p.seat_delta > 0 ? '+' : ''
                      return (
                        <tr key={p.party}>
                          <td style={{ fontWeight: 700 }}>{p.party}</td>
                          <td className="tabular" style={{ textAlign: 'right' }}>{fmtIN(p.postal_votes)}</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700 }}>{p.postal_share_pct.toFixed(2)}%</td>
                          <td className="tabular" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{p.evm_share_pct.toFixed(2)}%</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 800, color: ppColor }}>
                            {ppSign}{p.delta_pp.toFixed(2)}
                          </td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700, color: '#a78bfa' }}>
                            {p.postal_seats_led || '—'}
                          </td>
                          <td className="tabular" style={{ textAlign: 'right' }}>{p.seats_won || '—'}</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 800, color: seatColor }}>
                            {p.seat_delta === 0 ? '—' : `${seatSign}${p.seat_delta}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Swing modal */}
      {swingModalState && postalSwing && (() => {
        const s = postalSwing.states.find(x => x.state === swingModalState)
        if (!s) return null
        return (
          <div
            onClick={() => setSwingModalState(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(7,9,26,0.78)', backdropFilter: 'blur(6px)',
              zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              padding: '4rem 1rem 2rem', overflowY: 'auto', animation: 'fadeInUp 0.25s ease-out',
            }}
          >
            <div
              className="card"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 760, width: '100%', borderLeft: '4px solid #06b6d4', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    Postal Swing 2021 → 2026 · {s.name}
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#22d3ee' }}>
                    Institutional voter shift · {fmtIN(s.postal_total_2021)} → {fmtIN(s.postal_total_2026)} postal
                  </div>
                </div>
                <button
                  onClick={() => setSwingModalState(null)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                    borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >Close ✕</button>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Party</th>
                      <th style={{ textAlign: 'right' }}>2021 Share</th>
                      <th style={{ textAlign: 'right' }}>2026 Share</th>
                      <th style={{ textAlign: 'right' }}>Swing pp</th>
                      <th style={{ textAlign: 'right' }}>2021 Seats</th>
                      <th style={{ textAlign: 'right' }}>2026 Seats</th>
                      <th style={{ textAlign: 'right' }}>Δ Seats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.parties.map(p => {
                      const ppColor = p.swing_pp > 0 ? '#22c55e' : p.swing_pp < 0 ? '#ef4444' : 'var(--text-secondary)'
                      const ppSign = p.swing_pp > 0 ? '+' : ''
                      const seatColor = p.seat_swing > 0 ? '#22c55e' : p.seat_swing < 0 ? '#ef4444' : 'var(--text-secondary)'
                      const seatSign = p.seat_swing > 0 ? '+' : ''
                      return (
                        <tr key={p.party}>
                          <td style={{ fontWeight: 700 }}>{p.party}</td>
                          <td className="tabular" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{p.share_2021_pct.toFixed(2)}%</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700 }}>{p.share_2026_pct.toFixed(2)}%</td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 800, color: ppColor }}>
                            {ppSign}{p.swing_pp.toFixed(2)}
                          </td>
                          <td className="tabular" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {p.seats_led_2021 || '—'}
                          </td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 700, color: '#a78bfa' }}>
                            {p.seats_led_2026 || '—'}
                          </td>
                          <td className="tabular" style={{ textAlign: 'right', fontWeight: 800, color: seatColor }}>
                            {p.seat_swing === 0 ? '—' : `${seatSign}${p.seat_swing}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
