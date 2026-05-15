import { useState } from 'react'
import axios from 'axios'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useConstituencies, useResults } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import SortableTh from '../components/SortableTh'
import { useSortable } from '../lib/useSortable'
import InsightsCard, { type Insight } from '../components/InsightsCard'
import { fmtIN } from '../lib/format'
import { EmptyState } from '../components/EmptyState'

const PAGE_SIZE = 100

export default function Results() {
  const { state } = useParams<{ state: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Initialise every filter from URL params so deep-links (e.g. from KPI tiles
  // on Overview) actually filter the table instead of silently ignoring them.
  const [search, setSearch]               = useState(searchParams.get('search') ?? '')
  const [party, setParty]                 = useState(searchParams.get('party') ?? '')
  const [acFilter, setAcFilter]           = useState(searchParams.get('ac_number') ?? '')
  const [constituency, setConstituency]   = useState(searchParams.get('constituency') ?? '')
  const [district, setDistrict]           = useState(searchParams.get('district') ?? '')
  const [gender, setGender]               = useState(searchParams.get('gender') ?? '')
  const [criminal, setCriminal]           = useState<'' | 'true' | 'false'>(
    (searchParams.get('criminal') === 'true' ? 'true'
      : searchParams.get('criminal') === 'false' ? 'false' : '') as '' | 'true' | 'false'
  )
  const [winnersOnly, setWinnersOnly]     = useState(searchParams.get('winners_only') === 'true')
  const [top3Only, setTop3Only]           = useState(searchParams.get('top_n') === '3')
  const [sortBy, setSortBy]               = useState<'ac_asc' | 'votes_desc' | 'votes_asc' | 'margin_desc'>(
    (searchParams.get('sort_by') as any) ?? 'ac_asc'
  )
  const [page, setPage]                   = useState(0)

  const { data: constituencies } = useConstituencies(state!)
  const districts = Array.from(new Set((constituencies ?? []).map(c => c.district).filter(Boolean))).sort()

  const params: Record<string, string | number | boolean> = {
    sort_by: sortBy,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }
  if (search) params.search = search
  if (party) params.party = party
  if (acFilter) params.ac_number = Number(acFilter)
  if (constituency) params.constituency = constituency
  if (district) params.district = district
  if (gender) params.gender = gender
  if (criminal === 'true') params.criminal = true
  if (criminal === 'false') params.criminal = false
  if (winnersOnly) params.winners_only = true
  if (top3Only) params.top_n = 3

  const { data, isLoading, isError, refetch } = useResults(state!, params)

  // Client-side column sort over the current page's rows
  const { sorted, sort, onSort } = useSortable<any>(data?.candidates ?? [], null)

  // ─────────────────────  KEY INSIGHTS  ─────────────────────
  // Insights use the FULL state-wide constituency set (so "narrowest win" is
  // truly the narrowest statewide, not just on the current page). The filter
  // banner at the top still describes how many rows the active filters match.
  const fmtR = (n: number) => fmtIN(n)
  const resultsInsights: Insight[] = []
  const hasFilters = !!(search || party || acFilter || constituency || district || gender || criminal || winnersOnly || top3Only)
  // Statewide stats from useConstituencies (one row per AC with winner + margin).
  const declared = (constituencies ?? []).filter((c: any) => c.status !== 'pending' && c.party)
  const widest = [...declared].sort((a: any, b: any) => (b.margin ?? 0) - (a.margin ?? 0))[0]
  const narrowest = [...declared].filter((c: any) => (c.margin ?? 0) > 0).sort((a: any, b: any) => (a.margin ?? 0) - (b.margin ?? 0))[0]
  const topVote = [...declared].sort((a: any, b: any) => (b.votes ?? 0) - (a.votes ?? 0))[0]

  if (data) {
    // 1. Scope / filter summary (changes wording when filters are active)
    if (hasFilters) {
      const pageCount = data.candidates?.length ?? 0
      resultsInsights.push({
        emoji: '🔍', accent: '#818cf8',
        headline: `${fmtR(data.total)} candidate${data.total === 1 ? '' : 's'} match the active filters.`,
        detail: `Showing the top ${pageCount} on this page. The notable-seat callouts below describe the whole state — they don't change with filters.`,
      })
    } else {
      resultsInsights.push({
        emoji: '📋', accent: '#818cf8',
        headline: `${fmtR(data.total)} candidates contested across the state.`,
        detail: `Each row is one candidate. Use filters above to narrow by party, district, demographics, or to limit to winners / top contenders.`,
      })
    }
    // 2. Widest landslide statewide
    if (widest && widest.margin > 0) {
      resultsInsights.push({
        emoji: '🏆', accent: widest.color,
        headline: `Biggest landslide statewide: ${widest.name}.`,
        detail: `${widest.winner} (${widest.party}) won by ${fmtR(widest.margin)} votes — the largest victory margin anywhere in the state.`,
      })
    }
    // 3. Closest contest statewide
    if (narrowest && narrowest.margin > 0 && (!widest || narrowest.name !== widest.name)) {
      resultsInsights.push({
        emoji: '🎯', accent: narrowest.margin < 1000 ? '#ef4444' : '#f59e0b',
        headline: `Narrowest win statewide: ${narrowest.name} decided by just ${fmtR(narrowest.margin)} votes.`,
        detail: `${narrowest.winner} (${narrowest.party}) edged out the runner-up by ${narrowest.margin === 1 ? 'a single vote' : 'a paper-thin margin'}.`,
      })
    }
    // 4. Top vote-getter statewide
    const winnerVotes = topVote ? topVote.votes : 0
    if (topVote && (!widest || topVote.name !== widest.name)) {
      resultsInsights.push({
        emoji: '📊', accent: topVote.color,
        headline: `Highest individual vote total: ${topVote.winner}.`,
        detail: `${fmtR(winnerVotes)} votes in ${topVote.name} (${topVote.vote_share?.toFixed(1)}% share) — the most any single candidate received statewide.`,
      })
    }
  }

  const inputStyle = {
    padding: '0.45rem 0.75rem', borderRadius: 8,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
  }

  const fmt = (n: number) => fmtIN(n)

  const resetPage = () => setPage(0)

  const [exporting, setExporting] = useState(false)
  const exportCsv = async () => {
    if (!state) return
    setExporting(true)
    try {
      // Fetch the full filtered set (not just the current page) in one shot.
      const exportParams = { ...params, limit: 100000, offset: 0 }
      const res = await axios.get(`/api/${state}/candidates`, { params: exportParams })
      const rows: any[] = res.data.candidates ?? []
      const headers = [
        'ac_number', 'constituency', 'district', 'rank', 'name', 'party',
        'full_party_name', 'votes', 'vote_share', 'margin', 'is_winner',
        'age', 'gender', 'education', 'occupation', 'criminal_cases', 'assets_cr',
      ]
      const esc = (v: any) => {
        if (v === null || v === undefined) return ''
        const s = String(v).replace(/"/g, '""')
        return /[",\n]/.test(s) ? `"${s}"` : s
      }
      const csv = [
        headers.join(','),
        ...rows.map(r => headers.map(h => esc(r[h])).join(',')),
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `${state}-results-${ts}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  if (isError) {
    return (
      <div>
        <div className="page-title">Full Results — Every Candidate, Every Vote</div>
        <EmptyState
          variant="error"
          title="Couldn't load the candidate list."
          body="The backend may be down or temporarily unreachable. Refresh to try again."
          action={{ label: 'Retry', onClick: () => refetch() }}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="page-title">Full Results — Every Candidate, Every Vote</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        Authoritative ECI vote counts for all candidates in every assembly constituency. Use filters and sort to drill in.
      </div>

      <InsightsCard insights={resultsInsights} subtitle="Updates as you change filters" />

      {/* Filters */}
      <div className="filter-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); resetPage() }}
          placeholder="Search candidate name…" style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <input value={party} onChange={e => { setParty(e.target.value.toUpperCase()); resetPage() }}
          placeholder="Party (e.g. BJP)…" style={{ ...inputStyle, width: 150 }} />
        <input value={acFilter} onChange={e => { setAcFilter(e.target.value); resetPage() }}
          placeholder="AC #" type="number" style={{ ...inputStyle, width: 80 }} />
        <input value={constituency} onChange={e => { setConstituency(e.target.value); resetPage() }}
          placeholder="Constituency name…" style={{ ...inputStyle, width: 180 }} />
        <select value={district} onChange={e => { setDistrict(e.target.value); resetPage() }} style={inputStyle}>
          <option value="">All Districts</option>
          {districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={gender} onChange={e => { setGender(e.target.value); resetPage() }} style={inputStyle}>
          <option value="">All Genders</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
        <select value={criminal} onChange={e => { setCriminal(e.target.value as ''); resetPage() }} style={inputStyle}>
          <option value="">All (Criminal)</option>
          <option value="true">Has Cases</option>
          <option value="false">Clean Record</option>
        </select>
        <select value={sortBy} onChange={e => { setSortBy(e.target.value as any); resetPage() }} style={inputStyle}>
          <option value="ac_asc">Sort: AC# (asc)</option>
          <option value="votes_desc">Sort: Votes (high → low)</option>
          <option value="votes_asc">Sort: Votes (low → high)</option>
          <option value="margin_desc">Sort: Winners by votes</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.75rem', borderRadius: 8, background: winnersOnly ? 'rgba(34,197,94,0.12)' : 'var(--bg-card)', border: `1px solid ${winnersOnly ? '#22c55e' : 'var(--border)'}`, cursor: 'pointer', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={winnersOnly} onChange={e => { setWinnersOnly(e.target.checked); resetPage() }} />
          Winners only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.75rem', borderRadius: 8, background: top3Only ? 'rgba(59,130,246,0.12)' : 'var(--bg-card)', border: `1px solid ${top3Only ? '#3b82f6' : 'var(--border)'}`, cursor: 'pointer', fontSize: '0.85rem' }}
               title="Show only the top 3 vote-getters in each constituency">
          <input type="checkbox" checked={top3Only} onChange={e => { setTop3Only(e.target.checked); resetPage() }} />
          Top 3 per AC
        </label>
      </div>

      {/* Summary chips */}
      {data && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ padding: '0.5rem 0.9rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginRight: 6 }}>Total matching</span>
            <span style={{ fontWeight: 700 }}>{fmt(data.total)}</span>
          </div>
          <div className="stat-card" style={{ padding: '0.5rem 0.9rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginRight: 6 }}>Showing</span>
            <span style={{ fontWeight: 700 }}>
              {data.total === 0 ? '0' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, data.total)}`}
            </span>
          </div>
          {(search || party || acFilter || constituency || district || gender || criminal || winnersOnly || top3Only) && (
            <button onClick={() => { setSearch(''); setParty(''); setAcFilter(''); setConstituency(''); setDistrict(''); setGender(''); setCriminal(''); setWinnersOnly(false); setTop3Only(false); resetPage() }}
              style={{ padding: '0.45rem 0.85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}>
              Clear all filters
            </button>
          )}
          <button
            onClick={exportCsv}
            disabled={exporting || !data || data.total === 0}
            title={`Download all ${fmtIN(data.total)} matching rows as CSV`}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: 8,
              border: '1px solid #22c55e55',
              background: exporting ? 'rgba(34,197,94,0.05)' : 'rgba(34,197,94,0.12)',
              color: '#22c55e',
              cursor: exporting ? 'progress' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}>
            {exporting ? '⏳ Preparing CSV…' : `⬇ Download CSV (${fmtIN(data.total)})`}
          </button>
          <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
            💡 Tip: click a column to sort, <strong>Shift+click</strong> to add a tiebreaker
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <SortableTh label="AC#" sortKey="ac_number" sort={sort} onSort={onSort} />
                <SortableTh label="Constituency" sortKey="constituency" sort={sort} onSort={onSort} />
                <SortableTh label="District" sortKey="district" sort={sort} onSort={onSort} />
                <SortableTh label="Rank" sortKey="rank" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Candidate" sortKey="name" sort={sort} onSort={onSort} />
                <SortableTh label="Party" sortKey="party" sort={sort} onSort={onSort} />
                <SortableTh label="Votes" sortKey="votes" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Share" sortKey="vote_share" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Margin" sortKey="margin" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Result" sortKey="is_winner" sort={sort} onSort={onSort} />
                <SortableTh label="Age" sortKey="age" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Criminal" sortKey="criminal_cases" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Assets (Cr)" sortKey="assets_cr" sort={sort} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 10 }).map((_, r) => (
                <tr key={`sk-${r}`}>
                  {Array.from({ length: 13 }).map((_, c) => (
                    <td key={c}><span className="skeleton" style={{ width: c === 0 ? 24 : c === 1 ? 110 : 60, height: 12 }} /></td>
                  ))}
                </tr>
              ))}
              {sorted.map((c: any, i: number) => (
                <tr key={i} onClick={() => navigate(`/${state}/constituencies/${c.ac_number}`)}
                    style={{ cursor: 'pointer', background: c.is_winner ? 'rgba(34,197,94,0.04)' : 'transparent' }}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{c.ac_number}</td>
                  <td style={{ fontWeight: 600 }}>{c.constituency}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{c.district || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: c.rank === 1 ? '#22c55e' : c.rank === 2 ? '#f59e0b' : 'var(--text-secondary)' }}>
                    {c.rank}
                  </td>
                  <td>{c.name}</td>
                  <td>
                    <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44` }}>
                      <PartyLogo party={c.party} size={14} />
                      <span>{c.party}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(c.votes)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{c.vote_share.toFixed(2)}%</td>
                  <td style={{
                    textAlign: 'right', fontSize: '0.78rem', fontWeight: 600,
                    color: c.margin > 0 ? '#22c55e' : c.margin < 0 ? '#ef4444' : 'var(--text-secondary)',
                  }}>
                    {c.margin === 0 ? '—' : c.margin > 0 ? `+${fmt(c.margin)}` : `−${fmt(Math.abs(c.margin))}`}
                  </td>
                  <td>
                    {c.is_winner
                      ? <span className="badge badge-green">Won</span>
                      : <span className="badge" style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--text-secondary)' }}>Lost</span>}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{c.age ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: '0.78rem' }}>
                    {c.criminal_cases != null
                      ? <span style={{ color: c.criminal_cases > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{c.criminal_cases}</span>
                      : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {c.assets_cr != null ? `₹${c.assets_cr}` : '—'}
                  </td>
                </tr>
              ))}
              {data && data.candidates.length === 0 && (
                <tr><td colSpan={13} style={{ padding: '0.5rem' }}>
                  <EmptyState
                    title="No candidates match your filters."
                    body="Try widening the party, district, or status filters — or clear them to see every candidate."
                    action={{ label: 'Clear all filters', onClick: () => { setSearch(''); setParty(''); setAcFilter(''); setConstituency(''); setDistrict(''); setGender(''); setCriminal(''); setWinnersOnly(false); setTop3Only(false); resetPage() }}}
                  />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div style={{ display: 'flex', gap: 8, marginTop: '1rem', justifyContent: 'center', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
            ← Prev
          </button>
          <span style={{ padding: '0.4rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Page {page + 1} of {Math.ceil(data.total / PAGE_SIZE)}
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= data.total}
            style={{ padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: (page + 1) * PAGE_SIZE >= data.total ? 'not-allowed' : 'pointer', opacity: (page + 1) * PAGE_SIZE >= data.total ? 0.4 : 1 }}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
