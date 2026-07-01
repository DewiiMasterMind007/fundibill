import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'
import useIsMobile from '../hooks/useIsMobile'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtZAR = (n) => {
  const num = Number(n) || 0
  const [int, dec] = num.toFixed(2).split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `R ${formatted},${dec}`
}

const fmtZARShort = (n) => {
  const num = Number(n) || 0
  if (num >= 1_000_000) return `R ${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000)     return `R ${(num / 1_000).toFixed(0)}k`
  return `R ${num.toFixed(0)}`
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`
}

const PERIOD_FILTERS = [
  { key: '7d',  label: 'Last 7 Days',   getFrom: () => daysAgo(7) },
  { key: '30d', label: 'Last 30 Days',  getFrom: () => daysAgo(30) },
  { key: '3m',  label: 'Last 3 Months', getFrom: () => daysAgo(90) },
  { key: 'yr',  label: 'This Year',     getFrom: () => startOfYear() },
]

const CHART_PERIODS = [
  { key: '1m',  label: 'Last Month',     months: 1  },
  { key: '3m',  label: 'Last 3 Months',  months: 3  },
  { key: '6m',  label: 'Last 6 Months',  months: 6  },
  { key: '12m', label: 'Last 12 Months', months: 12 },
  { key: 'ytd', label: 'Year to Date',   months: null },
]

function getChartMonths(periodKey) {
  if (periodKey === 'ytd') return new Date().getMonth() + 1
  return CHART_PERIODS.find(p => p.key === periodKey)?.months || 6
}

function chartStartDate(periodKey) {
  if (periodKey === 'ytd') return startOfYear()
  const months = getChartMonths(periodKey)
  const d = new Date()
  d.setMonth(d.getMonth() - months + 1)
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon, loading, isMobile }) {
  return (
    <div style={{
      background: '#ffffff', borderRadius: 14,
      padding: isMobile ? 12 : '22px 24px',
      border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{
          fontSize: isMobile ? 10 : 11,
          fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>{label}</span>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: isMobile ? 28 : 34, height: isMobile ? 28 : 34,
          borderRadius: 9, background: accent + '18', color: accent,
        }}>{icon}</span>
      </div>
      {loading
        ? <div style={{ height: 26, width: 90, borderRadius: 6, background: '#f1f5f9', animation: 'pulse 1.5s ease-in-out infinite' }} />
        : <div style={{ fontSize: isMobile ? 24 : 26, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
      }
      {sub && <div style={{ fontSize: isMobile ? 11 : 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Custom bar chart tooltip ──────────────────────────────────────────────────

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rev = payload.find(p => p.dataKey === 'revenue')?.value || 0
  const exp = payload.find(p => p.dataKey === 'expense')?.value || 0
  const net = rev - exp
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
      <div style={{ color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color || '#fff', fontWeight: 700, marginBottom: 2 }}>
          {p.name}: {fmtZAR(p.value)}
        </div>
      ))}
      <div style={{ borderTop: '1px solid #334155', marginTop: 5, paddingTop: 5, color: net >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
        Net: {fmtZAR(net)}
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

const BADGE = {
  draft:   { label: 'Draft',   bg: '#f1f5f9', color: '#475569' },
  sent:    { label: 'Sent',    bg: '#dbeafe', color: '#1d4ed8' },
  paid:    { label: 'Paid',    bg: '#dcfce7', color: '#15803d' },
  overdue: { label: 'Overdue', bg: '#fee2e2', color: '#dc2626' },
}

function StatusBadge({ status }) {
  const m = BADGE[status] || BADGE.draft
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: m.bg, color: m.color }}>{m.label}</span>
  )
}

// ── Personalised greeting ─────────────────────────────────────────────────────

const DAY_GREETINGS = [
  (n) => `Happy Sunday${n ? ', ' + n : ''}! Rest up — big week ahead.`,
  (n) => `It's Monday${n ? ', ' + n : ''}! It's a good day to make more money.`,
  (n) => `Good Tuesday${n ? ', ' + n : ''}! Let's get those invoices out.`,
  (n) => `Happy Wednesday${n ? ', ' + n : ''}! You're halfway through the week.`,
  (n) => `Thursday already${n ? ', ' + n : ''}! Finish strong this week.`,
  (n) => `Happy Friday${n ? ', ' + n : ''}! Finish off this week strong.`,
  (n) => `It's Saturday${n ? ', ' + n : ''}! Even weekends are for winners.`,
]

function getDailyGreeting(name) {
  const day = new Date().getDay() // 0 = Sunday
  return DAY_GREETINGS[day](name || '')
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const { clients: cachedClients, profile } = useAppData()
  const isMobile  = useIsMobile()

  const [filterKey,    setFilterKey]    = useState('30d')
  const [chartPeriod,  setChartPeriod]  = useState('6m')
  const [invoices,     setInvoices]     = useState([])
  const [estimates,    setEstimates]    = useState([])
  const [expenses,     setExpenses]     = useState([])
  const [chartInvoices, setChartInvoices] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadingChart, setLoadingChart] = useState(true)
  const [error,        setError]        = useState('')

  // ── Custom date range ───────────────────────────────────────────────────────
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const isCustom = showCustom && !!customFrom && !!customTo && customFrom <= customTo

  // ── Load all invoices + estimates + clients (for stats + tables) ────────────
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const [
        { data: invData,  error: invErr  },
        { data: estData,  error: estErr  },
        { data: expData,  error: expErr  },
      ] = await Promise.all([
        supabase.from('invoices').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('estimates').select('id, status').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      ])

      if (invErr) throw new Error(invErr.message)
      if (estErr) throw new Error(estErr.message)
      if (expErr) throw new Error(expErr.message)

      // Enrich invoices with client names from global cache (no extra fetch)
      const clientMap = {}
      for (const c of cachedClients) clientMap[c.id] = c
      const enriched = (invData ?? []).map(inv => ({
        ...inv,
        client_name:    clientMap[inv.client_id]?.name    || '',
        client_company: clientMap[inv.client_id]?.company_name || '',
      }))

      setInvoices(enriched)
      setEstimates(estData ?? [])
      setExpenses(expData ?? [])
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [user, cachedClients])

  // ── Load chart invoices — re-fetches whenever chartPeriod changes ───────────
  const loadChart = useCallback(async () => {
    if (!user) return
    setLoadingChart(true)
    const from = chartStartDate(chartPeriod)
    const { data, error: chartErr } = await supabase
      .from('invoices')
      .select('issue_date, total')
      .eq('user_id', user.id)
      .gte('issue_date', from)
    if (!chartErr) setChartInvoices(data ?? [])
    setLoadingChart(false)
  }, [user, chartPeriod])

  useEffect(() => { load() },      [load])
  useEffect(() => { loadChart() }, [loadChart])

  // ── Period filter ───────────────────────────────────────────────────────────
  const activeFilter = PERIOD_FILTERS.find(f => f.key === filterKey) || PERIOD_FILTERS[1]
  const fromDate     = isCustom ? customFrom : activeFilter.getFrom()
  const toDate       = isCustom ? customTo   : null
  const periodLabel  = isCustom ? `${customFrom} – ${customTo}` : activeFilter.label.toLowerCase()

  const inPeriod = (inv) => {
    const d = inv.issue_date || inv.created_at?.slice(0, 10)
    if (!d) return false
    if (d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  }

  const periodInvoices = invoices.filter(inPeriod)

  // ── Stat computations ───────────────────────────────────────────────────────
  const totalInvoiced     = periodInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const invoicesIssued    = periodInvoices.length
  const totalCollected    = periodInvoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + (Number(i.amount_paid) || Number(i.total) || 0), 0)
  const overdueCount      = invoices.filter(i => i.status === 'overdue').length
  const outstanding       = invoices
    .filter(i => ['sent', 'overdue'].includes(i.status))
    .reduce((s, i) => s + Math.max(0, (Number(i.total) || 0) - (Number(i.amount_paid) || 0)), 0)
  const estimatesPending  = estimates.filter(e => e.status === 'sent').length

  // ── Revenue chart (uses Supabase-fetched chartInvoices) ────────────────────
  const chartMonthCount = getChartMonths(chartPeriod)
  const chartData = (() => {
    const now    = new Date()
    const months = []
    for (let i = chartMonthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() })
    }
    return months.map(({ year, month }) => {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
      const revenue = chartInvoices
        .filter(i => (i.issue_date || '').startsWith(prefix))
        .reduce((s, i) => s + (Number(i.total) || 0), 0)
      const expense = expenses
        .filter(e => (e.date || '').startsWith(prefix))
        .reduce((s, e) => s + (Number(e.amount) || 0), 0)
      return { name: MONTH_NAMES[month], revenue, expense }
    })
  })()

  // ── Payments by method (filtered to the active period) ─────────────────────
  const paymentMethods = (() => {
    const paidInPeriod = periodInvoices.filter(i => i.status === 'paid' && i.payment_method)
    if (paidInPeriod.length === 0) return []
    const map = {}
    for (const inv of paidInPeriod) {
      const m = inv.payment_method || 'Unknown'
      if (!map[m]) map[m] = { method: m, count: 0, total: 0 }
      map[m].count++
      map[m].total += Number(inv.amount_paid) || Number(inv.total) || 0
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  })()

  const showPaymentMethods = paymentMethods.length > 1

  // ── Expenses by category (filtered to the active period) ───────────────────
  const expensesByCategory = (() => {
    const inPeriodExpenses = expenses.filter(e => {
      const d = e.date
      if (!d) return false
      if (d < fromDate) return false
      if (toDate && d > toDate) return false
      return true
    })
    if (inPeriodExpenses.length === 0) return []
    const map = {}
    for (const exp of inPeriodExpenses) {
      const cat = exp.category || 'Uncategorized'
      if (!map[cat]) map[cat] = { category: cat, count: 0, total: 0 }
      map[cat].count++
      map[cat].total += Number(exp.amount) || 0
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  })()

  // ── Recent invoices ─────────────────────────────────────────────────────────
  const recentInvoices = [...invoices]
    .sort((a, b) => ((b.issue_date || b.created_at || '') > (a.issue_date || a.created_at || '') ? 1 : -1))
    .slice(0, 5)

  const METHOD_COLORS = ['#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      padding:        isMobile ? 16 : 32,
      paddingTop:     isMobile ? 16 : 32,
      paddingBottom:  isMobile ? 88 : 32,
      height:         '100%',
      width:          '100%',
      maxWidth:       '100%',
      boxSizing:      'border-box',
      overflowY:      'auto',
      overflowX:      'hidden',
      background:     '#f8fafc',
    }}>
      {/* pulse animation + hide scrollbar on filter strip */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .fb-filter-scroll::-webkit-scrollbar { display: none }
      `}</style>

      {/* ── Mobile greeting (desktop shows this inside the title block) ── */}
      {isMobile && (
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px', fontWeight: 500 }}>
          {getDailyGreeting(profile?.name)}
        </p>
      )}

      {/* ── Page header + filter ─────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     isMobile ? 'center' : 'flex-start',
        justifyContent: 'space-between',
        marginBottom:   showCustom ? 12 : isMobile ? 14 : 28,
        flexWrap:       'wrap',
        gap:            isMobile ? 8 : 16,
      }}>

        {/* Title — hidden on mobile (MobileHeader already shows the app name) */}
        {!isMobile && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0, marginBottom: 4 }}>Dashboard</h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>{getDailyGreeting(profile?.name)}</p>
          </div>
        )}

        {/* Controls row */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        8,
          width:      isMobile ? '100%' : 'auto',
        }}>
          {/* Period filter pill group — scrollable on mobile */}
          <div
            className={isMobile ? 'fb-filter-scroll' : undefined}
            style={{
              display:    'flex',
              background: '#ffffff',
              border:     '1px solid #e2e8f0',
              borderRadius: 10,
              padding:    3,
              gap:        2,
              boxShadow:  '0 1px 3px rgba(0,0,0,0.04)',
              opacity:    isCustom ? 0.45 : 1,
              transition: 'opacity 0.2s',
              flex:       isMobile ? 1 : undefined,
              // Mobile: horizontal scroll, no wrapping, hidden scrollbar
              overflowX:              isMobile ? 'auto'  : 'visible',
              WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
              msOverflowStyle:         isMobile ? 'none'  : undefined,
              scrollbarWidth:          isMobile ? 'none'  : undefined,
            }}
          >
            {PERIOD_FILTERS.map(f => (
              <button key={f.key}
                onClick={() => { setFilterKey(f.key); if (isCustom) { setCustomFrom(''); setCustomTo(''); setShowCustom(false) } }}
                style={{
                  padding:    isMobile ? '8px 12px' : '6px 14px',
                  borderRadius: 7,
                  border:     'none',
                  cursor:     'pointer',
                  fontSize:   isMobile ? 12 : 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: filterKey === f.key && !isCustom ? '#14b8a6' : 'transparent',
                  color:      filterKey === f.key && !isCustom ? '#fff'    : '#64748b',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Custom date range toggle */}
          <button
            title="Custom date range"
            onClick={() => setShowCustom(v => !v)}
            style={{
              display:    'flex', alignItems: 'center', justifyContent: 'center',
              width:      36, height: 36, borderRadius: 8,
              border:     `1.5px solid ${showCustom ? '#14b8a6' : '#e2e8f0'}`,
              background: showCustom ? '#f0fdfa' : '#fff',
              color:      showCustom ? '#14b8a6' : '#64748b',
              cursor:     'pointer',
              boxShadow:  '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          <HelpButton page="dashboard" />
        </div>
      </div>

      {/* ── Custom date range inputs ─────────────────────────────────────── */}
      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Custom range:</span>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${customFrom ? '#14b8a6' : '#e2e8f0'}`, fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer' }} />
          <span style={{ fontSize: 13, color: '#94a3b8' }}>to</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${customTo ? '#14b8a6' : '#e2e8f0'}`, fontSize: 13, color: '#0f172a', background: '#fff', outline: 'none', cursor: 'pointer' }} />
          {isCustom && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#14b8a6', background: '#f0fdfa', padding: '4px 10px', borderRadius: 999, border: '1px solid #99f6e4' }}>
              Custom range active
            </span>
          )}
          <button onClick={() => { setCustomFrom(''); setCustomTo(''); setShowCustom(false) }}
            style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = '#64748b'}
            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
            Clear
          </button>
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#dc2626', fontSize: 13, fontWeight: 500 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      {/* Mobile: 2-column grid. Desktop: 3-column grid (unchanged). */}
      <div data-tutorial="stat-cards" style={{
        display:             'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
        gap:                 isMobile ? 12 : 16,
        marginBottom:        isMobile ? 14 : 24,
      }}>
        <StatCard isMobile={isMobile} loading={loading} label="Total Invoiced"    value={fmtZAR(totalInvoiced)}  sub={periodLabel}          accent="#14b8a6"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
        <StatCard isMobile={isMobile} loading={loading} label="Invoices Issued"   value={invoicesIssued}          sub={periodLabel}          accent="#6366f1"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
        <StatCard isMobile={isMobile} loading={loading} label="Total Collected"   value={fmtZAR(totalCollected)}  sub={periodLabel}          accent="#10b981"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>} />
        <StatCard isMobile={isMobile} loading={loading} label="Overdue Invoices"  value={overdueCount}             sub="all time"             accent="#ef4444"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
        <StatCard isMobile={isMobile} loading={loading} label="Outstanding Amount" value={fmtZAR(outstanding)}     sub="all time"             accent="#f59e0b"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
        {/* 6th card — even count so no full-width span needed. */}
        <StatCard isMobile={isMobile} loading={loading} label="Pending Quotes"    value={estimatesPending}         sub="awaiting approval"    accent="#8b5cf6"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
      </div>

      {/* ── Revenue chart + Recent invoices ──────────────────────────────── */}
      {/* Mobile: stacked single column. Desktop: side-by-side (unchanged). */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap:                 isMobile ? 14 : 20,
        alignItems:          'start',
        marginBottom:        isMobile ? 14 : 20,
        width:               '100%',
        maxWidth:            '100%',
        overflow:            'hidden',
      }}>

        {/* Revenue + Expenses chart */}
        <div style={{
          background: '#ffffff', borderRadius: 14,
          padding:    isMobile ? 12 : '24px 24px 16px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          overflow:   'hidden',
          maxWidth:   '100%',
          minWidth:   0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 20 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Monthly Revenue &amp; Expenses</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>
                <span style={{ color: '#14b8a6', fontWeight: 600 }}>■</span> Revenue &nbsp;
                <span style={{ color: '#ef4444', fontWeight: 600 }}>■</span> Expenses
                {/* Hide "Hover for Net" hint on mobile — too cramped */}
                {!isMobile && (
                  <>&nbsp;<span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>Hover for Net</span></>
                )}
              </p>
            </div>
            <select value={chartPeriod} onChange={e => setChartPeriod(e.target.value)}
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', outline: 'none', cursor: 'pointer' }}>
              {CHART_PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          {loadingChart ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
              Loading chart…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <BarChart
                data={chartData}
                barSize={chartMonthCount > 6 ? 14 : 22}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  // On mobile with many months, show every other label to avoid overlap
                  interval={isMobile && chartMonthCount > 6 ? 1 : 0}
                />
                <YAxis
                  tickFormatter={fmtZARShort}
                  tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={isMobile ? 46 : 58}
                />
                <Tooltip content={<BarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="revenue" name="Revenue"  fill="#14b8a6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={10} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent invoices */}
        <div style={{
          background: '#ffffff', borderRadius: 14,
          padding:    isMobile ? 12 : '24px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          overflow:   'hidden',
          maxWidth:   '100%',
          minWidth:   0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 18 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Recent Invoices</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>Latest 5 invoices</p>
            </div>
            <button onClick={() => navigate('/invoices')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#14b8a6', padding: 0 }}>View All →</button>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 40, borderRadius: 8, background: '#f1f5f9', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : recentInvoices.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 0', color: '#94a3b8' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: 10 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <p style={{ fontSize: 13, margin: 0 }}>No invoices yet</p>
            </div>
          ) : (
            /* Scrollable wrapper on mobile so the table never clips */
            <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 420 : undefined }}>
                <thead>
                  <tr>
                    {['Invoice #', 'Client', 'Date', 'Amount', 'Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv, idx) => (
                    <tr key={inv.id} onClick={() => navigate('/invoices', { state: { openId: inv.id } })}
                      style={{ cursor: 'pointer', borderBottom: idx < recentInvoices.length - 1 ? '1px solid #f8fafc' : 'none' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{inv.invoice_number}</td>
                      <td style={{ padding: '10px 8px', fontSize: 13, color: '#475569', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.client_name || '—'}</td>
                      <td style={{ padding: '10px 8px', fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{inv.issue_date || '—'}</td>
                      <td style={{ padding: '10px 8px', fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{fmtZAR(inv.total)}</td>
                      <td style={{ padding: '10px 0' }}><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Payments by Method + Expenses by Category ───────────────────────── */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap:                 isMobile ? 14 : 20,
        marginBottom:        isMobile ? 14 : 20,
      }}>
        {showPaymentMethods && (
          <div style={{
            background: '#ffffff', borderRadius: 14,
            padding:    isMobile ? 12 : '24px',
            border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{ marginBottom: isMobile ? 12 : 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Payments Received by Method</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>Paid invoices within the selected period · {periodLabel}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {paymentMethods.map((pm, i) => (
                <div key={pm.method} style={{ background: '#f8fafc', border: `1.5px solid ${METHOD_COLORS[i % METHOD_COLORS.length]}30`, borderRadius: 10, padding: '14px 18px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: METHOD_COLORS[i % METHOD_COLORS.length], textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{pm.method}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>{fmtZAR(pm.total)}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{pm.count} payment{pm.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expenses by Category */}
        <div style={{
          background: '#ffffff', borderRadius: 14,
          padding:    isMobile ? 12 : '24px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div style={{ marginBottom: isMobile ? 12 : 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Expenses by Category</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>Recorded expenses within the selected period</p>
          </div>
          {expensesByCategory.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: '#94a3b8' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 13 }}>No expenses recorded yet — you&apos;re all caught up!</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {expensesByCategory.map((ec, i) => (
                <div key={ec.category} style={{ background: '#f8fafc', border: `1.5px solid ${METHOD_COLORS[i % METHOD_COLORS.length]}30`, borderRadius: 10, padding: '14px 18px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: METHOD_COLORS[i % METHOD_COLORS.length], textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{ec.category}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>{fmtZAR(ec.total)}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{ec.count} expense{ec.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Outstanding Invoices ──────────────────────────────────────────── */}
      {(() => {
        const todayMs = Date.now()
        const outstandingList = invoices.filter(i => ['sent', 'overdue'].includes(i.status))
        const rowColor = (inv) => {
          const issued = inv.issue_date ? new Date(inv.issue_date).getTime() : 0
          return Math.floor((todayMs - issued) / 86_400_000) > 7 ? '#dc2626' : '#d97706'
        }
        return (
          <div style={{
            background: '#ffffff', borderRadius: 14,
            padding:    isMobile ? 12 : '24px',
            border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 18 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Outstanding Invoices</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>
                  Sent &amp; overdue — <span style={{ color: '#d97706' }}>orange</span> = within 7 days · <span style={{ color: '#dc2626' }}>red</span> = past 7 days
                </p>
              </div>
              <button onClick={() => navigate('/invoices')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#14b8a6', padding: 0 }}>View All →</button>
            </div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2].map(i => (
                  <div key={i} style={{ height: 40, borderRadius: 8, background: '#f1f5f9', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            ) : outstandingList.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: '#94a3b8' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontSize: 13 }}>No outstanding invoices — you&apos;re all caught up!</span>
              </div>
            ) : (
              /* Scrollable wrapper on mobile */
              <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 360 : undefined }}>
                  <thead>
                    <tr>
                      {['Invoice #', 'Client', 'Date Issued', 'Amount'].map(h => (
                        <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingList.map((inv, idx) => {
                      const color = rowColor(inv)
                      return (
                        <tr key={inv.id} onClick={() => navigate('/invoices', { state: { openId: inv.id } })}
                          style={{ cursor: 'pointer', borderBottom: idx < outstandingList.length - 1 ? '1px solid #f8fafc' : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 0',  fontSize: 13, fontWeight: 700, color }}>{inv.invoice_number}</td>
                          <td style={{ padding: '10px 8px', fontSize: 13, fontWeight: 600, color }}>{inv.client_name || '—'}</td>
                          <td style={{ padding: '10px 8px', fontSize: 13, color, whiteSpace: 'nowrap' }}>{inv.issue_date || '—'}</td>
                          <td style={{ padding: '10px 0',  fontSize: 13, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{fmtZAR(inv.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
