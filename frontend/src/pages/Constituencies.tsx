import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useConstituencies } from '../lib/api'
import PartyLogo from '../components/PartyLogo'
import SortableTh from '../components/SortableTh'
import { useSortable } from '../lib/useSortable'
import { TableSkeleton } from '../components/Skeleton'
import { MicroBar } from '../components/Sparkline'
import { fmtIN, fmtCompact, fmtPct } from '../lib/format'

export default function Constituencies() {
  const { state } = useParams<{ state: string }>()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [partyFilter, setPartyFilter] = useState('')

  const { data, isLoading } = useConstituencies(state!, partyFilter ? { party: partyFilter } : {})

  const filtered = (data ?? [])
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.winner ?? '').toLowerCase().includes(search.toLowerCase()))

  const { sorted, sort, onSort } = useSortable<any>(filtered, { key: 'ac_number', dir: 'asc' })

  return (
    <div>
      <div className="page-title">Constituency Results</div>

      {/* Filters */}
      <div className="filter-row" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search constituency or candidate…"
          style={{
            flex: 1, minWidth: 220, padding: '0.5rem 0.75rem', borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
          }}
        />
        <input
          value={partyFilter} onChange={e => setPartyFilter(e.target.value)}
          placeholder="Filter by party (e.g. TVK)…"
          style={{
            width: 180, padding: '0.5rem 0.75rem', borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {isLoading ? <span className="skeleton" style={{ width: 90, height: 12 }} /> : `${filtered.length} constituencies`}
        </div>
      </div>

      {isLoading ? <TableSkeleton cols={7} rows={10} /> : (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <SortableTh label="AC #" sortKey="ac_number" sort={sort} onSort={onSort} />
                <SortableTh label="Constituency" sortKey="name" sort={sort} onSort={onSort} />
                <SortableTh label="District" sortKey="district" sort={sort} onSort={onSort} />
                <SortableTh label="Winner" sortKey="winner" sort={sort} onSort={onSort} />
                <SortableTh label="Party" sortKey="party" sort={sort} onSort={onSort} />
                <SortableTh label="Margin" sortKey="margin" sort={sort} onSort={onSort} align="right" />
                <SortableTh label="Vote Share" sortKey="vote_share" sort={sort} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c: any) => {
                const isPending = c.status === 'pending'
                return (
                  <tr key={c.ac_number} onClick={() => navigate(`/${state}/constituencies/${c.ac_number}`)}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{c.ac_number}</td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.district || '—'}</td>
                    <td>{isPending ? <span style={{ color: 'var(--text-secondary)' }}>—</span> : c.winner}</td>
                    <td>
                      {isPending ? (
                        <span className="badge badge-yellow" style={{ fontSize: '0.65rem' }}>⏳ Pending</span>
                      ) : (
                        <span className="badge" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}44` }}>
                          <PartyLogo party={c.party ?? ''} size={14} />
                          <span>{c.party}</span>
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: isPending ? 'var(--text-secondary)' : undefined, whiteSpace: 'nowrap' }}
                        title={isPending ? '' : `${fmtIN(c.margin)} votes margin (${c.margin_pct?.toFixed(2) ?? '?'}% of polled)`}>
                      {isPending ? '—' : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="tabular">{fmtCompact(c.margin)}</span>
                          {c.margin_pct !== undefined && (
                            <span className="tabular" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              ({c.margin_pct.toFixed(1)}%)
                            </span>
                          )}
                          <MicroBar value={c.margin} total={c.total_votes || c.margin * 5} color={c.color} width={36} />
                          {c.recount_eligible && (
                            <span title="Margin below 0.5% of polled votes — recount-eligible under Rule 56(C)"
                                  style={{
                                    fontSize: '0.6rem', fontWeight: 800,
                                    padding: '0.1rem 0.35rem', borderRadius: 4,
                                    background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                    border: '1px solid rgba(239,68,68,0.35)',
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                  }}>
                              ⚠ Recount
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ color: isPending ? 'var(--text-secondary)' : undefined }}>
                      {isPending ? '—' : fmtPct(c.vote_share)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
