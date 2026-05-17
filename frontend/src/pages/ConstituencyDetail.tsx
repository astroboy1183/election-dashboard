import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine, CartesianGrid } from 'recharts'
import { useConstituencyDetail } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import { PageSkeleton } from '../components/Skeleton'
import { fmtIN, fmtCompact } from '../lib/format'
import { axisTickStyle, tooltipContentStyle, tooltipLabelStyle } from '../lib/chartTheme'

export default function ConstituencyDetail() {
  const { state, acNumber } = useParams<{ state: string; acNumber: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useConstituencyDetail(state!, Number(acNumber))

  if (isLoading) return <PageSkeleton rows={10} />
  if (!data) return null

  const winner = data.candidates.find(c => c.is_winner)
  const isPending = !winner && data.total_votes === 0

  return (
    <div>
      <button
        onClick={() => {
          // If there's prior history, go back to wherever we came from; otherwise fall back to the constituencies list.
          if (window.history.length > 1) navigate(-1)
          else navigate(`/${state}/constituencies`)
        }}
        style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', marginBottom: '1rem', fontSize: '0.875rem' }}
      >
        ← Back
      </button>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Constituency Detail
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          {data.name}
          {isPending && (
            <span className="badge badge-yellow" style={{ fontSize: '0.65rem' }}>
              ⏳ Election Pending
            </span>
          )}
        </h1>
        {data.district && <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{data.district} District</div>}
      </div>

      {isPending && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #eab308' }}>
          <div style={{ fontSize: '0.72rem', color: '#facc15', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Election Pending
          </div>
          <div style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
            Voting for <strong>{data.name}</strong> is scheduled for a later date. Results will appear here once declared. {data.candidates.length} candidates are contesting.
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Winner</div>
          {winner ? (
            <>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{winner.name}</div>
              <div style={{ fontSize: '0.85rem', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PartyLogo party={winner.party} size={22} />
                <span style={{ color: winner.color, fontWeight: 600 }}>{winner.party}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-secondary)' }}>—</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                {isPending ? 'Awaiting results' : 'No winner declared'}
              </div>
            </>
          )}
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Winning Margin</div>
          <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>
            {isPending ? '—' : fmtIN(data.margin)}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{isPending ? 'pending' : 'votes'}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Total Votes</div>
          <div style={{ fontWeight: 700, fontSize: '1.5rem' }}>
            {isPending ? '—' : fmtIN(data.total_votes)}
          </div>
          {isPending && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>not yet polled</div>}
        </div>
      </div>

      {/* Who Represents You — citizen-facing card. Pairs the elected MLA
          (Assembly 2026 winner of this AC) with the sitting MP (LS 2024
          winner of the parent Lok Sabha seat that contains this AC).
          The dual representation that every Indian voter has but rarely
          sees side-by-side. */}
      {data.representation && (data.representation.mla || data.representation.mp) && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #a78bfa' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>🪪 Who Represents You</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Your two elected representatives — at the state assembly and the national parliament.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: 8 }}>
            {/* MLA — assembly */}
            {data.representation.mla ? (
              <div style={{
                padding: '1rem 1.1rem', borderRadius: 8,
                background: `${data.representation.mla.party_color}0c`,
                border: `1px solid ${data.representation.mla.party_color}44`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    🏛️ Member of Legislative Assembly (MLA)
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>elected 2026</div>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.25, marginBottom: 4 }}>
                  {data.representation.mla.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.82rem' }}>
                  <PartyLogo party={data.representation.mla.party} size={18} />
                  <span style={{ color: data.representation.mla.party_color, fontWeight: 700 }}>
                    {data.representation.mla.party}
                  </span>
                  {data.representation.mla.party_full_name && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      · {data.representation.mla.party_full_name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Represents <strong style={{ color: 'var(--text-primary)' }}>{data.representation.mla.constituency_name}</strong> (AC #{data.representation.mla.ac_number}) in the State Legislative Assembly.
                  {data.representation.mla.vote_share != null && (
                    <> Won with <strong style={{ color: 'var(--text-primary)' }}>{data.representation.mla.vote_share}%</strong> of votes.</>
                  )}
                </div>
                {/* Compact demographic chips */}
                {(data.representation.mla.age || data.representation.mla.gender || data.representation.mla.assets_cr != null) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {data.representation.mla.age != null && (
                      <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.5rem', borderRadius: 12,
                                     background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        🎂 Age {data.representation.mla.age}
                      </span>
                    )}
                    {data.representation.mla.gender && (
                      <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.5rem', borderRadius: 12,
                                     background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {data.representation.mla.gender === 'Male' ? '♂' : data.representation.mla.gender === 'Female' ? '♀' : '⚧'} {data.representation.mla.gender}
                      </span>
                    )}
                    {data.representation.mla.assets_cr != null && (
                      <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.5rem', borderRadius: 12,
                                     background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        💰 ₹{data.representation.mla.assets_cr} cr declared
                      </span>
                    )}
                    {data.representation.mla.criminal_cases != null && data.representation.mla.criminal_cases > 0 && (
                      <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.5rem', borderRadius: 12,
                                     background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
                        ⚖️ {data.representation.mla.criminal_cases} criminal case{data.representation.mla.criminal_cases === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '1rem', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                MLA data not yet declared for this AC.
              </div>
            )}

            {/* MP — parliament */}
            {data.representation.mp ? (
              <div style={{
                padding: '1rem 1.1rem', borderRadius: 8,
                background: `${data.representation.mp.party_color}0c`,
                border: `1px solid ${data.representation.mp.party_color}44`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    🏛️ Member of Parliament (MP)
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>elected {data.representation.mp.elected_year}</div>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.25, marginBottom: 4 }}>
                  {data.representation.mp.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.82rem' }}>
                  <PartyLogo party={data.representation.mp.party} size={18} />
                  <span style={{ color: data.representation.mp.party_color, fontWeight: 700 }}>
                    {data.representation.mp.party}
                  </span>
                  {data.representation.mp.party_full_name && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      · {data.representation.mp.party_full_name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Represents <strong style={{ color: 'var(--text-primary)' }}>{data.representation.mp.ls_name}</strong> (PC #{data.representation.mp.ls_number}) in the Lok Sabha. This assembly seat is one of its segments.
                </div>
                {(data.representation.mp.gender || data.representation.mp.seat_type) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {data.representation.mp.gender && (
                      <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.5rem', borderRadius: 12,
                                     background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {data.representation.mp.gender === 'Male' ? '♂' : data.representation.mp.gender === 'Female' ? '♀' : '⚧'} {data.representation.mp.gender}
                      </span>
                    )}
                    {data.representation.mp.seat_type && data.representation.mp.seat_type !== 'GEN' && (
                      <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.5rem', borderRadius: 12,
                                     background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.30)', color: '#a78bfa' }}>
                        🪶 Reserved ({data.representation.mp.seat_type})
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '1rem', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                MP data not yet linked for this AC.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Candidate bar chart */}
      {(() => {
        // Derived context the chart needs: winner/runner-up for the reference line,
        // plus a margin annotation in the header.
        const sortedByVotes = [...data.candidates].sort((a: any, b: any) => b.votes - a.votes)
        const top = sortedByVotes[0]
        const runnerUp = sortedByVotes[1]
        return (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>All Candidates — Vote Breakdown</div>
              {runnerUp && top && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Dashed line = <span style={{ color: '#eab308', fontWeight: 700 }}>runner-up at {fmtCompact(runnerUp.votes)}</span> · winner margin <strong style={{ color: '#22c55e' }}>+{fmtCompact(top.votes - runnerUp.votes)}</strong>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(220, data.candidates.length * 42)}>
              <BarChart data={data.candidates} layout="vertical" margin={{ left: 20, right: 200, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={axisTickStyle} tickFormatter={v => fmtCompact(v)} />
                <YAxis type="category" dataKey="name" width={160} tick={axisTickStyle} />
                <Tooltip
                  cursor={{ fill: 'rgba(167,139,250,0.06)' }}
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(v, _n, entry) => {
                    const c = (entry as any).payload
                    const marginFromTop = top ? c.votes - top.votes : 0
                    const marginLine = c.is_winner
                      ? `+${fmtIN(top.votes - (runnerUp?.votes ?? 0))} ahead of runner-up`
                      : `${fmtIN(Math.abs(marginFromTop))} behind winner`
                    return [`${fmtIN(Number(v))} votes (${c.vote_share}%) · ${marginLine}`, c.party]
                  }}
                  labelFormatter={(label) => label as string}
                />
                {/* Runner-up line lets you SEE the margin geometrically */}
                {runnerUp && (
                  <ReferenceLine x={runnerUp.votes} stroke="#eab308" strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ value: 'Runner-up', position: 'top', fill: '#eab308', fontSize: 10, fontWeight: 700 }} />
                )}
                <Bar dataKey="votes" radius={[0, 4, 4, 0]}>
                  {data.candidates.map(c => (
                    // Winner gets a slight outline + brighter fill so it pops vs the rest.
                    <Cell key={c.name} fill={c.color}
                      stroke={c.is_winner ? '#fde047' : 'transparent'}
                      strokeWidth={c.is_winner ? 1.5 : 0}
                    />
                  ))}
                  <LabelList
                    dataKey="votes"
                    position="right"
                    content={(props: any) => {
                      const { x, y, width, height, index } = props
                      const c = data.candidates[index]
                      if (!c) return null
                      const sharePct = `${c.vote_share}%`
                      return (
                        <g>
                          <text
                            x={x + width + 6}
                            y={y + height / 2 + 4}
                            fill="var(--text-primary)"
                            fontSize={11}
                            fontWeight={700}
                          >
                            {fmtIN(c.votes)}
                          </text>
                          <text
                            x={x + width + 6 + String(fmtIN(c.votes)).length * 7 + 6}
                            y={y + height / 2 + 4}
                            fill={c.color}
                            fontSize={11}
                            fontWeight={700}
                          >
                            ({c.party}, {sharePct})
                          </text>
                          {c.is_winner && (
                            <text
                              x={x + width + 6 + String(fmtIN(c.votes)).length * 7 + 6 + 8 + (c.party.length + sharePct.length + 4) * 7}
                              y={y + height / 2 + 4}
                              fill="#22c55e"
                              fontSize={11}
                              fontWeight={800}
                            >
                              ✓ Won
                            </text>
                          )}
                        </g>
                      )
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Candidate profiles + 2021 comparison */}
      <div className="col-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div className="card">
          <div className="section-title">Candidate Profiles</div>
          {data.candidates.slice(0, 5).map(c => (
            <div key={c.name} style={{
              padding: '0.75rem 0',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: c.is_winner ? 700 : 400, fontSize: '0.9rem' }}>
                  {c.is_winner && <span style={{ color: '#22c55e', marginRight: 5 }}>★</span>}
                  {c.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <PartyLogo party={c.party} size={16} />
                  <span style={{ color: c.color, fontWeight: 600 }}>{c.party}</span>
                  {c.age && <span>· {c.age} yrs</span>}
                  {c.gender && <span>· {c.gender}</span>}
                </div>
                {c.criminal_cases != null && (
                  <div style={{ fontSize: '0.72rem', marginTop: 2, color: c.criminal_cases > 0 ? '#ef4444' : '#22c55e' }}>
                    {c.criminal_cases} criminal case{c.criminal_cases !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{fmtIN(c.votes)}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{c.vote_share}%</div>
                {c.assets_cr != null && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>₹{c.assets_cr} Cr</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="section-title">Comparison with 2021</div>
          {(() => {
            const hist = data.historical_2021 ?? []
            if (hist.length === 0) {
              // Assam was redistricted in August 2023. Most 2026 ACs with no 2021 data
              // are new seats that simply didn't exist at the 2021 polls.
              const isAssamNewSeat = state === 'assam'
              return (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', padding: '1.25rem 0', textAlign: 'center' }}>
                  {isAssamNewSeat ? (
                    <>
                      <div style={{ fontSize: '1.75rem', marginBottom: 6 }}>🆕</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        New seat — formed after 2023 delimitation
                      </div>
                      <div style={{ fontSize: '0.78rem', maxWidth: 340, margin: '0 auto', lineHeight: 1.5 }}>
                        This constituency was created during the August 2023 redistricting of Assam,
                        so there is no 2021 result to compare against.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '2rem', marginBottom: 6 }}>—</div>
                      2021 comparison data not yet available for this constituency.
                    </>
                  )}
                </div>
              )
            }
            // Match parties across years
            const by21: Record<string, { votes: number; is_winner: boolean }> = {}
            hist.forEach(h => { by21[h.party] = { votes: h.votes, is_winner: h.is_winner } })
            const by26: Record<string, { votes: number; share: number; is_winner: boolean }> = {}
            data.candidates.forEach(c => { by26[c.party] = { votes: c.votes, share: c.vote_share, is_winner: c.is_winner } })

            const total21 = hist.reduce((s, h) => s + h.votes, 0) || 1
            const allParties = Array.from(new Set([...Object.keys(by21), ...Object.keys(by26)]))
            // Sort by max votes across either year, desc
            const rows = allParties
              .map(p => {
                const v21 = by21[p]?.votes ?? 0
                const v26 = by26[p]?.votes ?? 0
                const s21 = v21 ? (v21 / total21) * 100 : 0
                const s26 = by26[p]?.share ?? 0
                return {
                  party: p,
                  v21, v26, s21, s26,
                  delta: v26 - v21,
                  swing_pp: +(s26 - s21).toFixed(2),
                  color: data.candidates.find(c => c.party === p)?.color ?? '#94a3b8',
                  won21: by21[p]?.is_winner ?? false,
                  won26: by26[p]?.is_winner ?? false,
                  status: !v21 && v26 ? 'NEW' : v21 && !v26 ? 'DROPPED' : 'BOTH',
                }
              })
              .sort((a, b) => Math.max(b.v21, b.v26) - Math.max(a.v21, a.v26))
              .slice(0, 7)

            const fmt = (n: number) => fmtIN(n)

            return (
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 12,
                              display: 'grid', gridTemplateColumns: '1fr 1.1fr 0.7fr 1.1fr', gap: 8 }}>
                  <span>PARTY</span>
                  <span style={{ textAlign: 'right' }}>2021</span>
                  <span style={{ textAlign: 'center' }}>SWING</span>
                  <span style={{ textAlign: 'right' }}>2026</span>
                </div>

                {rows.map(r => {
                  const up = r.swing_pp > 0
                  const flat = Math.abs(r.swing_pp) < 0.5
                  return (
                    <div key={r.party} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.1fr 0.7fr 1.1fr',
                      gap: 8,
                      alignItems: 'center',
                      padding: '0.55rem 0',
                      borderBottom: '1px solid var(--border)',
                      opacity: r.status === 'DROPPED' ? 0.55 : 1,
                    }}>
                      {/* party */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.won26 && <span style={{ color: '#22c55e' }} title="2026 winner">★</span>}
                        <PartyLogo party={r.party} size={18} />
                        <span style={{ fontWeight: 700, color: r.color, fontSize: '0.85rem' }}>{r.party}</span>
                      </div>
                      {/* 2021 */}
                      <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                        {r.v21 > 0 ? (
                          <>
                            <div>{fmt(r.v21)}{r.won21 && <span style={{ color: '#22c55e', marginLeft: 4 }}>★</span>}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{r.s21.toFixed(1)}%</div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </div>
                      {/* swing arrow */}
                      <div style={{ textAlign: 'center' }}>
                        {r.status === 'NEW' ? (
                          <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 9999,
                                          background: 'rgba(34,197,94,0.18)', color: '#4ade80',
                                          fontWeight: 700, letterSpacing: '0.05em' }}>NEW</span>
                        ) : r.status === 'DROPPED' ? (
                          <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 9999,
                                          background: 'rgba(148,163,184,0.18)', color: '#94a3b8',
                                          fontWeight: 700, letterSpacing: '0.05em' }}>OUT</span>
                        ) : (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontSize: '1.1rem', color: flat ? '#94a3b8' : up ? '#22c55e' : '#ef4444', lineHeight: 1 }}>
                              {flat ? '→' : up ? '▲' : '▼'}
                            </span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700,
                                            color: flat ? '#94a3b8' : up ? '#4ade80' : '#f87171' }}>
                              {up ? '+' : ''}{r.swing_pp}pp
                            </span>
                          </div>
                        )}
                      </div>
                      {/* 2026 */}
                      <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                        {r.v26 > 0 ? (
                          <>
                            <div style={{ fontWeight: r.won26 ? 700 : 400 }}>
                              {fmt(r.v26)}{r.won26 && <span style={{ color: '#22c55e', marginLeft: 4 }}>★</span>}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{r.s26.toFixed(1)}%</div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Net vote delta summary */}
                {(() => {
                  const totalDelta = rows.reduce((s, r) => s + (r.v26 - r.v21), 0)
                  return (
                    <div style={{ marginTop: 12, padding: '0.6rem 0.75rem', borderRadius: 8,
                                  background: 'var(--bg-secondary)', fontSize: '0.75rem',
                                  color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Net turnout change</span>
                      <span style={{ fontWeight: 700, color: totalDelta > 0 ? '#4ade80' : totalDelta < 0 ? '#f87171' : 'var(--text-secondary)' }}>
                        {totalDelta > 0 ? '+' : ''}{fmt(totalDelta)} votes
                      </span>
                    </div>
                  )
                })()}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
