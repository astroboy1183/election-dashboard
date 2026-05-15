import { useParams } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, ReferenceArea, LabelList, CartesianGrid } from 'recharts'
import { useResults, usePartyAnalytics, useStateKPIs } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import SortableTh from '../components/SortableTh'
import { useSortable } from '../lib/useSortable'
import { useEscapeKey } from '../lib/useEscapeKey'
import InsightsCard, { type Insight } from '../components/InsightsCard'

export default function Assets() {
  const { state } = useParams<{ state: string }>()
  // Fetch ALL candidates + ALL winners — bumping limit so winners-only stats
  // (criminal MLAs, missing-affidavit list, top wealthy dedup) aren't truncated.
  const { data: allData } = useResults(state!, { limit: 5000 })
  const { data: crimData } = useResults(state!, { criminal: true, limit: 5000 })
  const { data: winnersData } = useResults(state!, { winners_only: true, limit: 500 })
  const { data: partyAnalytics } = usePartyAnalytics(state!)
  const { data: kpis } = useStateKPIs(state!)

  const total = allData?.total ?? 0
  const withCases = crimData?.total ?? 0

  // Modal state for the 3 clickable KPI tiles
  const [crimModalOpen, setCrimModalOpen] = useState(false)
  const [assetsModalOpen, setAssetsModalOpen] = useState(false)
  const [ageModalOpen, setAgeModalOpen] = useState(false)
  useEscapeKey(crimModalOpen, () => setCrimModalOpen(false))
  useEscapeKey(assetsModalOpen, () => setAssetsModalOpen(false))
  useEscapeKey(ageModalOpen, () => setAgeModalOpen(false))

  // Pre-compute winners arrays for the modals (so the heavy filtering happens once)
  const winners = useMemo(() => (winnersData?.candidates ?? []).filter(c => c.is_winner), [winnersData])
  const criminalMLAs = useMemo(() =>
    winners.filter(c => (c.criminal_cases ?? 0) > 0).sort((a, b) => (b.criminal_cases ?? 0) - (a.criminal_cases ?? 0)),
    [winners])
  const assetsMLAs = useMemo(() =>
    winners.filter(c => c.assets_cr != null).sort((a, b) => (b.assets_cr ?? 0) - (a.assets_cr ?? 0)),
    [winners])
  const agedMLAs = useMemo(() =>
    winners.filter(c => c.age != null).sort((a, b) => (a.age ?? 0) - (b.age ?? 0)),
    [winners])

  // Sortable hooks for the modal tables — must be at component top level
  const crimSort = useSortable<any>(criminalMLAs, [{ key: 'criminal_cases', dir: 'desc' }])
  const assetsSort = useSortable<any>(assetsMLAs, [{ key: 'assets_cr', dir: 'desc' }])
  const ageSort = useSortable<any>(agedMLAs, [{ key: 'age', dir: 'asc' }])

  // Party-wise criminal breakdown. We seed the map from allData first so every
  // party that fielded a candidate gets a row (with criminal=0 if none flagged),
  // then layer crimData on top. The previous order was crimData-first, which
  // meant parties with zero flagged candidates never got initialised and so
  // never appeared even though they should show a 0% bar.
  const partyMap: Record<string, { total: number; criminal: number; color: string }> = {}
  ;(allData?.candidates ?? []).forEach(c => {
    if (!partyMap[c.party]) partyMap[c.party] = { total: 0, criminal: 0, color: c.color }
    partyMap[c.party].total++
  })
  ;(crimData?.candidates ?? []).forEach(c => {
    if (!partyMap[c.party]) partyMap[c.party] = { total: 0, criminal: 0, color: c.color }
    partyMap[c.party].criminal++
  })

  const partyCrimData = Object.entries(partyMap)
    .map(([p, v]) => ({ party: p, pct: v.total > 0 ? +((v.criminal / v.total) * 100).toFixed(1) : 0, color: v.color }))
    .filter(p => p.pct > 0)
    .sort((a, b) => b.pct - a.pct)

  // Top by assets — dedupe candidates who contested 2+ ACs (e.g. Vijay won
  // both Perambur AND Tiruchirappalli East). Show all their constituencies
  // on one row rather than the same row twice.
  const topAssets = (() => {
    const byCandidate = new Map<string, any>()
    for (const c of (allData?.candidates ?? [])) {
      if (c.assets_cr == null) continue
      // Key on name+party — same person across ACs collapses; different people who share a name don't.
      const key = `${c.name.trim().toUpperCase()}|${c.party}`
      const existing = byCandidate.get(key)
      if (!existing) {
        byCandidate.set(key, { ...c, _constituencies: [c.constituency], _wins: c.is_winner ? 1 : 0 })
      } else if (existing.assets_cr === c.assets_cr) {
        // Same value → same person filing two affidavits; collapse
        existing._constituencies.push(c.constituency)
        if (c.is_winner) existing._wins += 1
      } else {
        // Different asset values → likely two different people with same name; keep both
        byCandidate.set(`${key}|${c.constituency}`, { ...c, _constituencies: [c.constituency], _wins: c.is_winner ? 1 : 0 })
      }
    }
    return [...byCandidate.values()]
      .sort((a, b) => (b.assets_cr ?? 0) - (a.assets_cr ?? 0))
      .slice(0, 10)
  })()

  const { sorted: sortedTopAssets, sort: aSort, onSort: aOnSort } =
    useSortable<any>(topAssets, { key: 'assets_cr', dir: 'desc' })

  // Winners with cases
  const winnersWithCases = (winnersData?.candidates ?? []).filter(c => c.is_winner && (c.criminal_cases ?? 0) > 0)

  // Winners whose affidavits we could NOT match — surface them transparently.
  // A winner is "no affidavit" if both assets AND criminal data are absent (which
  // for our pipeline means MyNeta had no record for them at all).
  const winnersNoAffidavit = (winnersData?.candidates ?? []).filter(
    c => c.is_winner && c.assets_cr == null && c.criminal_cases == null,
  )
  const winnersTotal = (winnersData?.candidates ?? []).filter(c => c.is_winner).length

  // ─────────────────────  KEY INSIGHTS  ─────────────────────
  const assetsInsights: Insight[] = []
  const parties: any[] = partyAnalytics?.parties ?? []
  // Always-on coverage line. Phrase changes based on how complete the data is.
  const totalCand = allData?.total ?? 0
  const winnersWithAssets = (winnersData?.candidates ?? []).filter(c => c.is_winner && c.assets_cr != null).length
  const winnersWithCrim = (winnersData?.candidates ?? []).filter(c => c.is_winner && c.criminal_cases != null).length
  if (totalCand > 0 && winnersTotal > 0) {
    const assetsCovPct = (winnersWithAssets / winnersTotal) * 100
    const crimCovPct = (winnersWithCrim / winnersTotal) * 100
    const missing = winnersNoAffidavit.length
    if (assetsCovPct >= 95 && crimCovPct >= 95) {
      assetsInsights.push({
        emoji: '📊', accent: '#22c55e',
        headline: `MLA-level coverage is high — ${winnersWithAssets}/${winnersTotal} have assets, ${winnersWithCrim}/${winnersTotal} have criminal records.`,
        detail: missing === 0
          ? `Every winner is covered. Per-candidate stats (across all ${totalCand} contestants) are sparser — only a fraction file affidavits with MyNeta.`
          : `${missing} winner${missing === 1 ? '' : 's'} have no affidavit data on MyNeta — listed below. Per-candidate stats across all ${totalCand} contestants are sparser because most losing candidates don't get scraped.`,
      })
    } else {
      assetsInsights.push({
        emoji: '📊', accent: '#94a3b8',
        headline: `Coverage caveat: ${winnersWithAssets}/${winnersTotal} MLAs have asset data; ${winnersWithCrim}/${winnersTotal} have criminal records.`,
        detail: `Stats below are computed only over winners whose MyNeta affidavits we could match. ${missing} winner${missing === 1 ? '' : 's'} have no affidavit data at all — listed below.`,
      })
    }
  }
  // 1. Most-criminal party
  const seatBacked = parties.filter(p => p.contested >= 5 && p.criminal_pct != null)
  const worstCrim = [...seatBacked].sort((a, b) => b.criminal_pct - a.criminal_pct)[0]
  if (worstCrim && worstCrim.criminal_pct >= 30) {
    assetsInsights.push({
      emoji: '⚖️', accent: '#ef4444',
      headline: `${worstCrim.party}'s slate has the most criminal cases.`,
      detail: `${worstCrim.criminal_pct}% of their candidates have at least one criminal case (${worstCrim.candidates_with_criminal} of ${worstCrim.contested}). Highest of any party with ≥5 candidates.`,
    })
  }
  // 2. Cleanest slate
  const cleanest = [...seatBacked].sort((a, b) => a.criminal_pct - b.criminal_pct)[0]
  if (cleanest && worstCrim && cleanest.party !== worstCrim.party && cleanest.criminal_pct < 20) {
    assetsInsights.push({
      emoji: '✨', accent: '#22c55e',
      headline: `${cleanest.party} fielded the cleanest slate.`,
      detail: `Only ${cleanest.criminal_pct}% of ${cleanest.party}'s ${cleanest.contested} candidates have any criminal case on record — the lowest among meaningful slates.`,
    })
  }
  // 3. Wealthiest slate / individual
  const wealthByParty = parties.filter(p => p.contested >= 3 && p.avg_assets_cr != null)
  const richest = [...wealthByParty].sort((a, b) => b.avg_assets_cr - a.avg_assets_cr)[0]
  if (richest) {
    assetsInsights.push({
      emoji: '💰', accent: '#facc15',
      headline: `${richest.party} fields the wealthiest candidates on average.`,
      detail: `Average declared assets ₹${richest.avg_assets_cr} cr per candidate (median ₹${richest.median_assets_cr} cr) across ${richest.contested} contestants.`,
    })
  }
  // 4. Winners with criminal cases
  if (winnersWithCases.length > 0 && totalCand > 0) {
    const totalWinners = (winnersData?.candidates ?? []).filter(c => c.is_winner).length
    const winnerCrimPct = totalWinners > 0 ? ((winnersWithCases.length / totalWinners) * 100).toFixed(0) : '—'
    assetsInsights.push({
      emoji: '🏛️', accent: '#f97316',
      headline: `${winnersWithCases.length} winners have criminal cases on record.`,
      detail: `That's ~${winnerCrimPct}% of MLAs we have data for. The voters returned them despite declared cases — a recurring pattern in Indian elections.`,
    })
  }

  return (
    <div>
      <div className="page-title">Candidate Criminality & Assets</div>

      <InsightsCard insights={assetsInsights} subtitle="From MyNeta-enriched candidate affidavits" />

      {/* Winners-only KPI row (the more decision-relevant cohort) — all clickable */}
      {kpis && (
        <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
          <div
            className="stat-card stat-card-clickable"
            style={{ borderLeft: '3px solid #ef4444', cursor: 'pointer' }}
            onClick={() => setCrimModalOpen(true)}
            title="Click for full list of MLAs with criminal cases"
          >
            <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              ⚖️ MLAs with criminal cases
            </div>
            <div className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>
              {kpis.demographics.criminal_mlas_pct}%
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {kpis.demographics.criminal_mlas} of {kpis.declared} MLAs · <strong style={{ color: '#fca5a5' }}>{kpis.demographics.serious_criminal_mlas}</strong> have ≥ 3 cases
            </div>
          </div>
          <div
            className="stat-card stat-card-clickable"
            style={{ borderLeft: '3px solid #facc15', cursor: 'pointer' }}
            onClick={() => setAssetsModalOpen(true)}
            title="Click for asset distribution + top wealthy MLAs"
          >
            <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              💰 Typical MLA assets
            </div>
            <div className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#facc15' }}>
              ₹{kpis.demographics.median_assets_cr ?? '—'} cr
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              median · avg <strong>₹{kpis.demographics.avg_assets_cr ?? '—'} cr</strong> · {kpis.demographics.assets_coverage} with data
            </div>
          </div>
          <div
            className="stat-card stat-card-clickable"
            style={{ borderLeft: '3px solid #67e8f9', cursor: 'pointer' }}
            onClick={() => setAgeModalOpen(true)}
            title="Click for age distribution + youngest/oldest MLAs"
          >
            <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              🎂 Avg MLA age
            </div>
            <div className="tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#67e8f9' }}>
              {kpis.demographics.avg_age ?? '—'} yrs
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              range {kpis.demographics.youngest}–{kpis.demographics.oldest}
            </div>
          </div>
          <div
            className="stat-card stat-card-clickable"
            style={{ borderLeft: '3px solid #a78bfa', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
            onClick={() => setAgeModalOpen(true)}
            title="Click for age distribution detail"
          >
            <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              📊 Age distribution
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flex: 1, minHeight: 36 }}>
              {([
                ['u35', '<35', '#22c55e'],
                ['35_44', '35-44', '#4ade80'],
                ['45_54', '45-54', '#a78bfa'],
                ['55_64', '55-64', '#f59e0b'],
                ['65p', '65+', '#ef4444'],
              ] as const).map(([k, label, c]) => {
                const v = kpis.demographics.age_distribution[k as keyof typeof kpis.demographics.age_distribution] ?? 0
                const maxV = Math.max(...Object.values(kpis.demographics.age_distribution))
                const h = maxV > 0 ? (v / maxV) * 32 : 0
                return (
                  <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${v} MLAs age ${label}`}>
                    <span className="tabular" style={{ fontSize: '0.62rem', color: c, fontWeight: 700 }}>{v}</span>
                    <div style={{ height: Math.max(2, h), width: '100%', background: c, borderRadius: 2 }} />
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* All-candidates KPI row — consolidated from 4 tiles to 2.
          • "With Criminal Cases" (count) + "% of Total" merged: shows both numbers in one tile.
          • "Winners w/ Cases" removed — the same fact (with a more accurate denominator) is
            already in the winners-only "MLAs with criminal cases" tile above. */}
      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Total Candidates
          </div>
          <div className="tabular" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{total.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>across every AC in this state</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Candidates with Criminal Cases
          </div>
          {(() => {
            // Honest denominator: only candidates whose affidavits we matched (criminal_cases != null).
            const candWithData = (allData?.candidates ?? []).filter(c => c.criminal_cases != null).length
            const honestPct = candWithData > 0 ? ((withCases / candWithData) * 100).toFixed(1) : '—'
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="tabular" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{withCases.toLocaleString('en-IN')}</span>
                  <span className="tabular" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f87171' }}>· {honestPct}%</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  of {candWithData.toLocaleString('en-IN')} candidates with affidavit data ({total.toLocaleString('en-IN')} total contested, most losing candidates aren't scraped)
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* Transparent "missing data" notice — list winners whose MyNeta affidavits
          we couldn't match. Only renders when there ARE missing ones. */}
      {winnersNoAffidavit.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #94a3b8' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              ⚠️ {winnersNoAffidavit.length} winner{winnersNoAffidavit.length === 1 ? '' : 's'} — no affidavit data
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              These MLAs are NOT included in the asset/criminal stats above. Source: MyNeta has no record for them.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem' }}>
            {winnersNoAffidavit.map(c => (
              <div key={`${c.name}-${c.constituency}`} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.7rem',
                background: 'rgba(148,163,184,0.06)', borderRadius: 6, fontSize: '0.78rem',
              }}>
                <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44`, fontSize: '0.65rem' }}>
                  <PartyLogo party={c.party} size={12} />
                  <span>{c.party}</span>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{c.constituency}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Criminal % by party */}
      <div className="col-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card">
          {(() => {
            const pcts = partyCrimData.map(p => p.pct).filter(Number.isFinite)
            const avg = pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : 0
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <div className="section-title" style={{ marginBottom: 0 }}>Criminal Cases % by Party</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Dashed line = <span style={{ color: '#eab308', fontWeight: 700 }}>avg {avg.toFixed(1)}%</span> · <span style={{ color: '#f87171', fontWeight: 700 }}>red zone ≥ 50%</span>
                  </div>
                </div>
                {partyCrimData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(220, partyCrimData.length * 26)}>
                    <BarChart data={partyCrimData} layout="vertical" margin={{ left: 10, right: 60, top: 6 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis type="category" dataKey="party" width={60} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(167,139,250,0.06)' }}
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '0.55rem 0.75rem' }}
                        labelStyle={{ color: 'var(--text-primary)', fontWeight: 700 }}
                        formatter={(v: any, _n, p: any) => {
                          const n = Number(v)
                          const delta = n - avg
                          const cmp = delta > 0 ? `+${delta.toFixed(1)}pp above state avg` : delta < 0 ? `${delta.toFixed(1)}pp below state avg` : 'at state avg'
                          return [`${n.toFixed(1)}% of candidates · ${cmp}`, p?.payload?.party]
                        }}
                        labelFormatter={(l) => l as string}
                      />
                      {/* Red zone: parties above 50% have a majority of criminal-case slates */}
                      <ReferenceArea x1={50} x2={100} fill="#ef4444" fillOpacity={0.05} />
                      {avg > 0 && (
                        <ReferenceLine x={avg} stroke="#eab308" strokeDasharray="4 4" strokeWidth={1.5}
                          label={{ value: 'avg', position: 'top', fill: '#eab308', fontSize: 10, fontWeight: 700 }} />
                      )}
                      <Bar dataKey="pct" radius={[0, 4, 4, 0]} name="% with cases">
                        {partyCrimData.map(p => <Cell key={p.party} fill={p.color} />)}
                        <LabelList dataKey="pct" position="right" fill="var(--text-primary)" fontSize={11} fontWeight={700}
                          formatter={((v: number) => `${v}%`) as any} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', padding: '1rem 0', fontSize: '0.875rem' }}>
                    Criminal data not available in current dataset.
                  </div>
                )}
              </>
            )
          })()}
        </div>

        <div className="card">
          <div className="section-title">Candidates with Criminal Cases</div>
          {crimData?.candidates.slice(0, 8).map(c => (
            <div key={`${c.name}-${c.constituency}`} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.5rem 0', borderBottom: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <PartyLogo party={c.party} size={14} />
                  <span style={{ color: c.color, fontWeight: 600 }}>{c.party}</span>
                  <span>· {c.constituency}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#ef4444' }}>{c.criminal_cases} cases</div>
                {c.is_winner && <span className="badge badge-green" style={{ fontSize: '0.62rem' }}>Won</span>}
              </div>
            </div>
          )) ?? <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No data available.</div>}
        </div>
      </div>

      {/* Top assets */}
      <div className="card">
        <div className="section-title">Top 10 Candidates by Declared Assets</div>
        {topAssets.length > 0 ? (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <SortableTh label="Candidate" sortKey="name" sort={aSort} onSort={aOnSort} />
                  <SortableTh label="Party" sortKey="party" sort={aSort} onSort={aOnSort} />
                  <SortableTh label="Constituency" sortKey="constituency" sort={aSort} onSort={aOnSort} />
                  <SortableTh label="Status" sortKey="is_winner" sort={aSort} onSort={aOnSort} />
                  <SortableTh label="Assets" sortKey="assets_cr" sort={aSort} onSort={aOnSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedTopAssets.map((c: any, i: number) => {
                  const acs: string[] = c._constituencies ?? [c.constituency]
                  const wins: number = c._wins ?? (c.is_winner ? 1 : 0)
                  return (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>
                        <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44` }}>
                          <PartyLogo party={c.party} size={14} />
                          <span>{c.party}</span>
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {acs.length === 1
                          ? acs[0]
                          : <span title={acs.join(' · ')}>{acs[0]} <span style={{ opacity: 0.7 }}>+{acs.length - 1} more</span></span>}
                      </td>
                      <td>
                        {wins === 0
                          ? <span className="badge" style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--text-secondary)' }}>Lost</span>
                          : wins === 1
                            ? <span className="badge badge-green">Won</span>
                            : <span className="badge badge-green" title={`Won ${wins} seats — must vacate ${wins - 1} per RPA §70`}>Won ×{wins}</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{c.assets_cr} Cr</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', padding: '1rem 0', fontSize: '0.875rem' }}>
            Asset data not available in current dataset. Enrich via ECI affidavit scraper.
          </div>
        )}
      </div>

      {/* ──────────────  Criminal MLAs modal  ────────────── */}
      {crimModalOpen && (() => {
        const sorted = crimSort.sorted
        // Per-party rollup
        const byParty: Record<string, { count: number; serious: number; color: string }> = {}
        for (const m of criminalMLAs) {
          if (!byParty[m.party]) byParty[m.party] = { count: 0, serious: 0, color: m.color }
          byParty[m.party].count++
          if ((m.criminal_cases ?? 0) >= 3) byParty[m.party].serious++
        }
        const partyRows = Object.entries(byParty).sort((a, b) => b[1].count - a[1].count)
        const serious = criminalMLAs.filter(m => (m.criminal_cases ?? 0) >= 3)
        const topCase = criminalMLAs[0]
        return (
          <ModalShell onClose={() => setCrimModalOpen(false)} accent="#ef4444"
            title="⚖️ MLAs with criminal cases" subtitle={`${criminalMLAs.length} of ${winners.length} MLAs — ${serious.length} have ≥ 3 cases`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <StatBox label="Total MLAs with cases" value={criminalMLAs.length.toString()} color="#ef4444" />
              <StatBox label="Serious (≥ 3 cases)" value={serious.length.toString()} color="#f87171" />
              <StatBox label="Highest case count" value={topCase ? `${topCase.criminal_cases} (${topCase.name.split(' ').slice(0, 2).join(' ')})` : '—'} color="#facc15" small />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>By party</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {partyRows.map(([party, info]) => {
                  const pct = (info.count / criminalMLAs.length) * 100
                  return (
                    <div key={party} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                      <span className="badge" style={{ background: `${info.color}22`, color: info.color, border: `1px solid ${info.color}44`, minWidth: 56 }}>
                        <PartyLogo party={party} size={14} /><span>{party}</span>
                      </span>
                      <div style={{ flex: 1, height: 10, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: info.color, borderRadius: 4 }} />
                      </div>
                      <span className="tabular" style={{ minWidth: 75, textAlign: 'right' }}>
                        <strong>{info.count}</strong>
                        {info.serious > 0 && <span style={{ color: '#fca5a5', fontSize: '0.72rem' }}> · {info.serious} sr</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              All MLAs with criminal cases — sortable
            </div>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <SortableTh label="Name" sortKey="name" sort={crimSort.sort} onSort={crimSort.onSort} />
                    <SortableTh label="Party" sortKey="party" sort={crimSort.sort} onSort={crimSort.onSort} />
                    <SortableTh label="Constituency" sortKey="constituency" sort={crimSort.sort} onSort={crimSort.onSort} />
                    <SortableTh label="Cases" sortKey="criminal_cases" sort={crimSort.sort} onSort={crimSort.onSort} align="right" />
                    <SortableTh label="Margin" sortKey="margin" sort={crimSort.sort} onSort={crimSort.onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c: any, i: number) => {
                    const isSerious = (c.criminal_cases ?? 0) >= 3
                    return (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>
                          <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44` }}>
                            <PartyLogo party={c.party} size={14} /><span>{c.party}</span>
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{c.constituency}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: isSerious ? '#ef4444' : 'var(--text-primary)' }}>
                          {c.criminal_cases}{isSerious && <span style={{ marginLeft: 4, fontSize: '0.65rem', color: '#fca5a5' }}>SR</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.margin?.toLocaleString('en-IN') ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </ModalShell>
        )
      })()}

      {/* ──────────────  Typical Assets modal  ────────────── */}
      {assetsModalOpen && (() => {
        const sorted = assetsSort.sorted
        const assets = assetsMLAs.map(c => c.assets_cr as number)
        const sortedAsc = [...assets].sort((a, b) => a - b)
        const median = sortedAsc[Math.floor(sortedAsc.length / 2)] ?? 0
        const avg = assets.reduce((s, v) => s + v, 0) / (assets.length || 1)
        const max = sortedAsc[sortedAsc.length - 1] ?? 0
        const min = sortedAsc[0] ?? 0
        // Buckets: <0.5cr · 0.5-2 · 2-10 · 10-50 · 50+
        const buckets = [
          { label: '< ₹0.5 cr', min: 0, max: 0.5, color: '#94a3b8' },
          { label: '₹0.5–2 cr', min: 0.5, max: 2, color: '#4ade80' },
          { label: '₹2–10 cr', min: 2, max: 10, color: '#facc15' },
          { label: '₹10–50 cr', min: 10, max: 50, color: '#f97316' },
          { label: '₹50 cr+', min: 50, max: Infinity, color: '#ef4444' },
        ].map(b => ({ ...b, count: assets.filter(v => v >= b.min && v < b.max).length }))
        const lowAssetMLAs = assetsMLAs.filter(c => (c.assets_cr ?? 0) < 0.5)
        return (
          <ModalShell onClose={() => setAssetsModalOpen(false)} accent="#facc15"
            title="💰 Typical MLA assets" subtitle={`${assetsMLAs.length} of ${winners.length} MLAs declared affidavits`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <StatBox label="Median" value={`₹${median.toFixed(2)} cr`} color="#facc15" />
              <StatBox label="Average" value={`₹${avg.toFixed(2)} cr`} color="#f59e0b" />
              <StatBox label="Wealthiest" value={`₹${max.toLocaleString('en-IN')} cr`} color="#ef4444" small />
              <StatBox label="Lowest declared" value={`₹${min.toFixed(3)} cr`} color="#94a3b8" small />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Asset distribution</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buckets.map(b => {
                  const pct = (b.count / assetsMLAs.length) * 100
                  return (
                    <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                      <span style={{ minWidth: 90, color: 'var(--text-secondary)' }}>{b.label}</span>
                      <div style={{ flex: 1, height: 12, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: b.color, borderRadius: 4 }} />
                      </div>
                      <span className="tabular" style={{ minWidth: 70, textAlign: 'right' }}>
                        <strong>{b.count}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                  )
                })}
              </div>
              {avg > median * 2 && (
                <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#fbbf24' }}>
                  📈 Average (₹{avg.toFixed(2)} cr) is &gt; 2× median (₹{median.toFixed(2)} cr) — distribution is skewed by a few ultra-rich MLAs.
                </div>
              )}
              {lowAssetMLAs.length > 0 && (
                <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  ℹ️ {lowAssetMLAs.length} MLA{lowAssetMLAs.length === 1 ? '' : 's'} declared assets under ₹0.5 cr — review for under-declaration or genuine low-asset wins.
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              All MLAs by declared assets — sortable
            </div>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <SortableTh label="Name" sortKey="name" sort={assetsSort.sort} onSort={assetsSort.onSort} />
                    <SortableTh label="Party" sortKey="party" sort={assetsSort.sort} onSort={assetsSort.onSort} />
                    <SortableTh label="Constituency" sortKey="constituency" sort={assetsSort.sort} onSort={assetsSort.onSort} />
                    <SortableTh label="Assets" sortKey="assets_cr" sort={assetsSort.sort} onSort={assetsSort.onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c: any, i: number) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>
                        <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44` }}>
                          <PartyLogo party={c.party} size={14} /><span>{c.party}</span>
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{c.constituency}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{(c.assets_cr ?? 0).toLocaleString('en-IN')} cr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModalShell>
        )
      })()}

      {/* ──────────────  Age modal  ────────────── */}
      {ageModalOpen && (() => {
        const sorted = ageSort.sorted
        const ages = agedMLAs.map(c => c.age as number)
        const avg = ages.reduce((s, v) => s + v, 0) / (ages.length || 1)
        const sortedAges = [...ages].sort((a, b) => a - b)
        const median = sortedAges[Math.floor(sortedAges.length / 2)] ?? 0
        const youngest = agedMLAs[0]
        const oldest = agedMLAs[agedMLAs.length - 1]
        // Buckets matching the tile
        const buckets = [
          { key: '<35', min: 0, max: 35, color: '#22c55e', label: 'Under 35 (young)' },
          { key: '35-44', min: 35, max: 45, color: '#4ade80', label: '35–44' },
          { key: '45-54', min: 45, max: 55, color: '#a78bfa', label: '45–54' },
          { key: '55-64', min: 55, max: 65, color: '#f59e0b', label: '55–64' },
          { key: '65+', min: 65, max: Infinity, color: '#ef4444', label: '65+ (senior)' },
        ].map(b => ({ ...b, count: ages.filter(v => v >= b.min && v < b.max).length }))
        return (
          <ModalShell onClose={() => setAgeModalOpen(false)} accent="#67e8f9"
            title="🎂 MLA age distribution" subtitle={`${agedMLAs.length} of ${winners.length} MLAs with age data`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <StatBox label="Average age" value={`${avg.toFixed(1)} yrs`} color="#67e8f9" />
              <StatBox label="Median age" value={`${median} yrs`} color="#22d3ee" />
              <StatBox label="Youngest" value={youngest ? `${youngest.age} (${youngest.name.split(' ').slice(0, 2).join(' ')})` : '—'} color="#22c55e" small />
              <StatBox label="Oldest" value={oldest ? `${oldest.age} (${oldest.name.split(' ').slice(0, 2).join(' ')})` : '—'} color="#ef4444" small />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Age bracket breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buckets.map(b => {
                  const pct = (b.count / agedMLAs.length) * 100
                  return (
                    <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                      <span style={{ minWidth: 130, color: 'var(--text-secondary)' }}>{b.label}</span>
                      <div style={{ flex: 1, height: 12, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: b.color, borderRadius: 4 }} />
                      </div>
                      <span className="tabular" style={{ minWidth: 70, textAlign: 'right' }}>
                        <strong>{b.count}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              All MLAs by age — sortable
            </div>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <SortableTh label="Name" sortKey="name" sort={ageSort.sort} onSort={ageSort.onSort} />
                    <SortableTh label="Party" sortKey="party" sort={ageSort.sort} onSort={ageSort.onSort} />
                    <SortableTh label="Constituency" sortKey="constituency" sort={ageSort.sort} onSort={ageSort.onSort} />
                    <SortableTh label="Age" sortKey="age" sort={ageSort.sort} onSort={ageSort.onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c: any, i: number) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>
                        <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44` }}>
                          <PartyLogo party={c.party} size={14} /><span>{c.party}</span>
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{c.constituency}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{c.age} yrs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModalShell>
        )
      })()}
    </div>
  )
}

// ──────────────  Modal helpers  ──────────────
function ModalShell({
  onClose, accent, title, subtitle, children,
}: {
  onClose: () => void; accent: string; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(7, 9, 26, 0.78)', backdropFilter: 'blur(6px)',
      zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '4rem 1rem 2rem', overflowY: 'auto', animation: 'fadeInUp 0.25s ease-out',
    }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{
        maxWidth: 880, width: '100%', borderLeft: `4px solid ${accent}`,
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent, marginBottom: 4 }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
            borderRadius: 8, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
          }}>Close ✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function StatBox({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${color}`, padding: '0.7rem 0.85rem' }}>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <div className="tabular" style={{ fontSize: small ? '0.95rem' : '1.25rem', fontWeight: 800, color }}>{value}</div>
    </div>
  )
}
