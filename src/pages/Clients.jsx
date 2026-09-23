import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'
import useIsMobile from '../hooks/useIsMobile'
import ClientContactModal from '../components/ClientContactModal'
import { getClientContacts, addClientContact, updateClientContact, deleteClientContact } from '../utils/clientContacts'

const READONLY_MSG = 'Your trial has ended. Upgrade to continue.'

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  company_name: '', email: '', phone: '', address: '', website: '',
}

const STATUS = {
  draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#475569' },
  sent:      { label: 'Sent',      bg: '#dbeafe', color: '#1d4ed8' },
  paid:      { label: 'Paid',      bg: '#dcfce7', color: '#166534' },
  overdue:   { label: 'Overdue',   bg: '#fee2e2', color: '#dc2626' },
  approved:  { label: 'Approved',  bg: '#dcfce7', color: '#166534' },
  rejected:  { label: 'Rejected',  bg: '#fee2e2', color: '#dc2626' },
  converted: { label: 'Converted', bg: '#ede9fe', color: '#7c3aed' },
}

const PALETTE = [
  '#14b8a6','#6366f1','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#0ea5e9','#f97316',
]

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatZAR(amount) {
  const n = Number(amount) || 0
  const [int, dec] = n.toFixed(2).split('.')
  return 'R ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec
}

function fmtDate(str) {
  if (!str) return '—'
  try {
    return new Date(str).toLocaleDateString('en-ZA', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return str }
}

function nameToColor(name) {
  let h = 5381
  for (const c of (name || '')) h = ((h << 5) + h) ^ c.charCodeAt(0)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function nameToInitials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function validateForm(d) {
  const e = {}
  if (!d.company_name?.trim()) e.company_name = 'Business name is required'
  if (d.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'Invalid email address'
  return e
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT = {
  width:      '100%',
  background: '#f8fafc',
  border:     '1.5px solid #e2e8f0',
  borderRadius: 8,
  color:      '#0f172a',
  fontSize:   14,
  padding:    '9px 12px',
  outline:    'none',
  transition: 'border-color 0.15s',
  fontFamily: 'inherit',
}

const onFocus = e => { e.currentTarget.style.borderColor = '#14b8a6' }
const onBlur  = e => { e.currentTarget.style.borderColor = '#e2e8f0' }

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 38 }) {
  return (
    <div style={{
      width:          size,
      height:         size,
      borderRadius:   '50%',
      background:     nameToColor(name),
      color:          '#fff',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontSize:       Math.round(size * 0.36),
      fontWeight:     700,
      flexShrink:     0,
      letterSpacing:  '-0.5px',
      userSelect:     'none',
    }}>
      {nameToInitials(name)}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft
  return (
    <span style={{
      background:    s.bg,
      color:         s.color,
      fontSize:      11,
      fontWeight:    700,
      padding:       '3px 8px',
      borderRadius:  999,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      whiteSpace:    'nowrap',
      display:       'inline-block',
    }}>
      {s.label}
    </span>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '72px 20px',
      color:          '#94a3b8',
    }}>
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none"
        stroke="#e2e8f0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
        style={{ marginBottom: 20 }}>
        <circle cx="9"  cy="7"  r="4" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
      <p style={{ fontSize: 17, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
        No clients yet
      </p>
      <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 28 }}>
        Add your first client to get started
      </p>
      <button
        onClick={onAdd}
        style={{
          background:   '#14b8a6',
          color:        '#fff',
          border:       'none',
          borderRadius: 8,
          padding:      '10px 22px',
          fontSize:     14,
          fontWeight:   600,
          cursor:       'pointer',
          boxShadow:    '0 2px 8px rgba(20,184,166,0.3)',
        }}
      >
        + Add New Client
      </button>
    </div>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({ clientName, onConfirm, onCancel }) {
  return (
    <div style={{
      position:       'fixed',
      inset:          0,
      zIndex:         200,
      background:     'rgba(15,23,42,0.6)',
      backdropFilter: 'blur(4px)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background:   '#fff',
        borderRadius: 14,
        padding:      '28px 32px',
        maxWidth:     400,
        width:        '90%',
        boxShadow:    '0 24px 64px rgba(0,0,0,0.2)',
        border:       '1px solid #e2e8f0',
      }}>
        <div style={{
          width:          44,
          height:         44,
          borderRadius:   '50%',
          background:     '#fee2e2',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          marginBottom:   16,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        </div>

        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Delete client?
        </h3>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, marginBottom: 24 }}>
          <strong style={{ color: '#374151' }}>{clientName}</strong> will be permanently deleted.
          Their invoices and estimates will remain but will be unlinked.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              background:   '#f8fafc',
              border:       '1.5px solid #e2e8f0',
              color:        '#374151',
              borderRadius: 8,
              padding:      '9px 18px',
              fontSize:     14,
              fontWeight:   500,
              cursor:       'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background:   '#dc2626',
              border:       'none',
              color:        '#fff',
              borderRadius: 8,
              padding:      '9px 18px',
              fontSize:     14,
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            Delete Client
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel form field ─────────────────────────────────────────────────────────

function PanelField({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display:    'block',
        fontSize:   13,
        fontWeight: 500,
        color:      '#374151',
        marginBottom: 5,
      }}>
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  )
}

// ─── Info row (detail view) ───────────────────────────────────────────────────

function InfoRow({ icon, text }) {
  if (!text) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#475569' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: 1 }}>
        <path d={icon} />
      </svg>
      <span style={{ lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

// ─── Stat card (detail view) ──────────────────────────────────────────────────

function StatCard({ value, label, accent }) {
  return (
    <div style={{
      background:   '#f8fafc',
      border:       '1px solid #e2e8f0',
      borderRadius: 10,
      padding:      '14px 20px',
      textAlign:    'center',
      minWidth:     100,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent || '#0f172a', letterSpacing: '-0.5px' }}>
        {value}
      </div>
      <div style={{
        fontSize:      10,
        color:         '#94a3b8',
        fontWeight:    600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginTop:     3,
        whiteSpace:    'nowrap',
      }}>
        {label}
      </div>
    </div>
  )
}

// ─── Mobile client card ───────────────────────────────────────────────────────

function MobileClientCard({ client, onEdit, onViewInvoices, onViewEstimates, onDelete, onUnarchive, isReadOnly }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const name  = client.company_name || client.name || '?'
  const color = nameToColor(name)

  useEffect(() => {
    const fn = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const menuItems = [
    { label: 'Edit',           fn: () => { setMenuOpen(false); onEdit(client) } },
    { label: 'View Invoices',  fn: () => { setMenuOpen(false); onViewInvoices(client) } },
    { label: 'View Estimates', fn: () => { setMenuOpen(false); onViewEstimates(client) } },
    !isReadOnly && client.is_archived && { label: 'Unarchive', fn: () => { setMenuOpen(false); onUnarchive(client) } },
    !isReadOnly && !client.is_archived && { label: 'Delete', fn: () => { setMenuOpen(false); onDelete(client) }, danger: true },
  ].filter(Boolean)

  return (
    <div
      onClick={() => onViewInvoices(client)}
      style={{
        background:   '#fff',
        borderRadius: 8,
        boxShadow:    '0 1px 4px rgba(0,0,0,0.07)',
        border:       '1px solid #f1f5f9',
        padding:      16,
        marginBottom: 10,
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        position:     'relative',
      }}
    >
      {/* Avatar */}
      <div style={{
        width:          44,
        height:         44,
        borderRadius:   '50%',
        background:     color,
        color:          '#fff',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontWeight:     700,
        fontSize:       17,
        flexShrink:     0,
        letterSpacing:  '-0.3px',
        userSelect:     'none',
      }}>
        {nameToInitials(name).charAt(0)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          {client.is_archived && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>ARCHIVED</span>
          )}
        </div>
        {client.email && (
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {client.email}
          </div>
        )}
        {client.phone && (
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {client.phone}
          </div>
        )}
      </div>

      {/* Three-dot menu */}
      <div
        ref={menuRef}
        onClick={e => e.stopPropagation()}
        style={{ flexShrink: 0, position: 'relative', alignSelf: 'flex-start', marginTop: -4 }}
      >
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
          aria-label="More actions"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: '#94a3b8', fontSize: 20, lineHeight: 1, letterSpacing: 2, borderRadius: 6 }}
        >···</button>

        {menuOpen && (
          <div style={{
            position:  'absolute', right: 0, top: '100%', zIndex: 200,
            background: '#fff', borderRadius: 10,
            boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
            border:    '1px solid #e2e8f0',
            minWidth:  168, overflow: 'hidden', marginTop: 4,
          }}>
            {menuItems.map(item => (
              <button
                key={item.label}
                onClick={item.fn}
                style={{
                  display:    'block', width: '100%',
                  padding:    '12px 16px',
                  background: 'none', border: 'none',
                  cursor:     'pointer', textAlign: 'left',
                  fontSize:   14, fontWeight: 500,
                  color:      item.danger ? '#dc2626' : '#0f172a',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = item.danger ? '#fef2f2' : '#f8fafc' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >{item.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Clients() {
  const location    = useLocation()
  const { user }    = useAuth()
  const trialStatus = useTrialStatus()
  const isReadOnly  = trialStatus?.isReadOnly ?? false
  const isMobile    = useIsMobile()

  // clients list comes from the global cache; refreshClients() re-fetches after writes
  const { clients, loaded: appLoaded, refreshClients } = useAppData()

  const [view,          setView]         = useState('list')
  const [loading,       setLoading]      = useState(!appLoaded)
  const [opError,       setOpError]      = useState('')
  const [search,        setSearch]       = useState('')
  const [clientStats,   setClientStats]  = useState({})
  const [showArchived,  setShowArchived] = useState(false)

  // Detail view
  const [selected,      setSelected]     = useState(null)
  const [clientDocs,    setClientDocs]   = useState({ invoices: [], estimates: [] })
  const [docsLoading,   setDocsLoading]  = useState(false)
  const [activeTab,     setActiveTab]    = useState('invoices')

  // Panel (add / edit)
  const [panelOpen,     setPanelOpen]    = useState(false)
  const [editingClient, setEditing]      = useState(null)
  const [form,          setForm]         = useState(EMPTY_FORM)
  const [originalForm,  setOriginalForm] = useState(EMPTY_FORM)
  const [errors,        setErrors]       = useState({})
  const [saving,        setSaving]       = useState(false)

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [checkingDelete, setCheckingDelete] = useState(false)
  const [archiveConfirm, setArchiveConfirm] = useState(null) // client with linked docs, offered archive instead
  const [archiving,      setArchiving]      = useState(false)
  const [unarchivingId,  setUnarchivingId]  = useState(null)

  const firstInputRef = useRef(null)

  // Once the global cache has loaded, clear our local loading flag
  useEffect(() => { if (appLoaded) setLoading(false) }, [appLoaded])

  // Fetch invoice count + total per client for the list columns
  useEffect(() => {
    if (!appLoaded || !user || clients.length === 0) return
    async function fetchStats() {
      const { data } = await supabase
        .from('invoices')
        .select('client_id, total')
        .eq('user_id', user.id)
      if (!data) return
      const stats = {}
      for (const inv of data) {
        if (!inv.client_id) continue
        if (!stats[inv.client_id]) stats[inv.client_id] = { count: 0, total: 0 }
        stats[inv.client_id].count += 1
        stats[inv.client_id].total += Number(inv.total) || 0
      }
      setClientStats(stats)
    }
    fetchStats()
  }, [appLoaded, clients, user])

  // ── Load per-client docs (invoices + estimates) ───────────────────────────

  async function loadClientDocs(clientId) {
    setDocsLoading(true)
    const [{ data: invData }, { data: estData }] = await Promise.all([
      supabase.from('invoices').select('*').eq('client_id', clientId).eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('estimates').select('*').eq('client_id', clientId).eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setClientDocs({
      invoices:  invData  ?? [],
      estimates: estData  ?? [],
    })
    setDocsLoading(false)
  }

  // Focus first panel input when it opens
  useEffect(() => {
    if (panelOpen) setTimeout(() => firstInputRef.current?.focus(), 60)
  }, [panelOpen])

  // ── Navigation ────────────────────────────────────────────────────────────

  function openDetail(client) {
    setSelected(client)
    setActiveTab('invoices')
    setView('detail')
    loadClientDocs(client.id)
  }

  // Open detail view with a specific tab (used by mobile card menu)
  function openDetailWithTab(client, tab) {
    setSelected(client)
    setActiveTab(tab)
    setView('detail')
    loadClientDocs(client.id)
  }

  function goBack() {
    setView('list')
    setSelected(null)
  }

  // ── Additional contacts ──────────────────────────────────────────────────

  const [contacts,             setContacts]           = useState([])
  const [contactsLoading,      setContactsLoading]     = useState(false)
  const [contactModal,         setContactModal]        = useState(null) // null | 'new' | contact object
  const [deleteContactConfirm, setDeleteContactConfirm] = useState(null)

  async function loadContacts(clientId) {
    setContactsLoading(true)
    try {
      const rows = await getClientContacts(supabase, clientId)
      setContacts(rows)
    } catch (_) {
      setContacts([])
    } finally {
      setContactsLoading(false)
    }
  }

  async function handleSaveContact(values) {
    if (!editingClient) return
    try {
      if (contactModal && contactModal !== 'new') {
        await updateClientContact(supabase, contactModal.id, user.id, values)
      } else {
        await addClientContact(supabase, user.id, editingClient.id, values)
      }
      setContactModal(null)
      await loadContacts(editingClient.id)
    } catch (e) {
      setErrors(p => ({ ...p, _global: e.message }))
    }
  }

  async function handleDeleteContact() {
    if (!deleteContactConfirm) return
    try {
      await deleteClientContact(supabase, deleteContactConfirm.id, user.id)
      setDeleteContactConfirm(null)
      await loadContacts(editingClient.id)
    } catch (e) {
      setErrors(p => ({ ...p, _global: e.message }))
    }
  }

  // ── Panel helpers ─────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOriginalForm(EMPTY_FORM)
    setErrors({})
    setContacts([])
    setPanelOpen(true)
  }

  // Auto-open add client panel when navigated via the quick-create menu
  useEffect(() => {
    if (location.state?.quickCreate && !isReadOnly) {
      openAdd()
      window.history.replaceState({}, '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit(client) {
    setEditing(client)
    const initial = {
      company_name: client.company_name ?? client.name ?? '',
      email:        client.email        ?? '',
      phone:        client.phone        ?? '',
      address:      client.address      ?? '',
      website:      client.website      ?? '',
    }
    setForm(initial)
    setOriginalForm(initial)
    setErrors({})
    setPanelOpen(true)
    loadContacts(client.id)
  }

  function closePanel() {
    setPanelOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setContacts([])
  }

  function setField(field) {
    return e => {
      setForm(p => ({ ...p, [field]: e.target.value }))
      if (errors[field]) setErrors(p => ({ ...p, [field]: '' }))
    }
  }

  // Entry point for both the detail-view Delete button and the mobile
  // card's Delete menu item. Checks whether this client has any invoices
  // or estimates before deciding whether a hard delete is even possible —
  // if it has history, offers archiving instead of letting the delete hit
  // the FK constraint and surface a raw Postgres error.
  async function openDeleteFlow(client) {
    setSelected(client)
    setOpError('')
    setCheckingDelete(true)
    try {
      const [{ count: invCount }, { count: estCount }] = await Promise.all([
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('user_id', user.id),
        supabase.from('estimates').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('user_id', user.id),
      ])
      const hasDocs = (invCount || 0) + (estCount || 0) > 0
      if (hasDocs) {
        setArchiveConfirm(client)
      } else {
        setConfirmDelete(true)
      }
    } catch (err) {
      setOpError(err.message)
    } finally {
      setCheckingDelete(false)
    }
  }

  async function handleArchiveConfirm() {
    if (!archiveConfirm) return
    setArchiving(true)
    const { error } = await supabase
      .from('clients')
      .update({ is_archived: true })
      .eq('id', archiveConfirm.id)
      .eq('user_id', user.id)
    setArchiving(false)
    setArchiveConfirm(null)
    if (error) {
      setOpError(error.message)
    } else {
      goBack()
      refreshClients()
    }
  }

  async function handleUnarchive(client) {
    setUnarchivingId(client.id)
    const { error } = await supabase
      .from('clients')
      .update({ is_archived: false })
      .eq('id', client.id)
      .eq('user_id', user.id)
    setUnarchivingId(null)
    if (error) {
      setOpError(error.message)
    } else {
      if (view === 'detail' && selected?.id === client.id) {
        setSelected(prev => ({ ...prev, is_archived: false }))
      }
      refreshClients()
    }
  }

  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm)

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validateForm(form)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    const bizName = form.company_name.trim()
    const payload = {
      name:         bizName,
      company_name: bizName,
      email:        form.email.trim()   || null,
      phone:        form.phone.trim()   || null,
      address:      form.address.trim() || null,
      website:      form.website.trim() || null,
    }

    try {
      let savedClient = null

      if (editingClient) {
        const { data, error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingClient.id)
          .eq('user_id', user.id)
          .select()
          .single()
        if (error) throw new Error(error.message)
        savedClient = data
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert({ ...payload, user_id: user.id })
          .select()
          .single()
        if (error) throw new Error(error.message)
        savedClient = data
      }

      setSaving(false)
      closePanel()
      await refreshClients()
      if (editingClient && view === 'detail' && savedClient) {
        setSelected(prev => ({ ...prev, ...savedClient }))
      }
    } catch (err) {
      setSaving(false)
      setErrors({ _global: err.message })
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!selected) return
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', selected.id)
      .eq('user_id', user.id)
    setConfirmDelete(false)
    if (error) {
      // 23503 = Postgres foreign key violation. The pre-check in
      // openDeleteFlow() should already catch this, but a doc created in
      // the window between that check and this delete (or any other path
      // that somehow reaches this function) would otherwise surface a raw
      // DB error — fall back to offering archive instead.
      if (error.code === '23503') {
        setArchiveConfirm(selected)
      } else {
        setOpError(error.message)
      }
    } else {
      goBack()
      refreshClients()
    }
  }

  // ── Search + archived filter (client-side) ────────────────────────────────

  const q = search.toLowerCase()
  const searchScope = showArchived ? clients : clients.filter(c => !c.is_archived)
  const visibleClients = q
    ? searchScope.filter(c =>
        (c.company_name || c.name)?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
      )
    : searchScope

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>

      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      {panelOpen && (
        <div
          onClick={closePanel}
          style={{
            position:       'fixed',
            inset:          0,
            zIndex:         40,
            background:     'rgba(15,23,42,0.3)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* ── Main scrollable area ─────────────────────────────────────────── */}
      <div style={{ height: '100%', overflowY: 'auto', padding: isMobile ? '16px 16px 80px' : '32px 32px 64px' }}>

        {/* ════════════════════════ LIST VIEW ════════════════════════════ */}
        {view === 'list' && (
          <>
            {/* Header row */}
            <div style={{
              display:        'flex',
              alignItems:     'flex-start',
              justifyContent: 'space-between',
              marginBottom:   isMobile ? 12 : 24,
            }}>
              {/* Title — hidden on mobile */}
              {!isMobile && (
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                    Clients
                  </h1>
                  <p style={{ fontSize: 14, color: '#64748b' }}>
                    {loading
                      ? 'Loading…'
                      : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-end' }}>
                {/* Add New Client button — desktop only; mobile uses FAB */}
                {!isMobile && (
                  <button
                    onClick={isReadOnly ? undefined : openAdd}
                    disabled={isReadOnly}
                    title={isReadOnly ? READONLY_MSG : undefined}
                    style={{
                      background:   '#14b8a6',
                      color:        '#fff',
                      border:       'none',
                      borderRadius: 8,
                      padding:      '10px 18px',
                      fontSize:     14,
                      fontWeight:   600,
                      cursor:       isReadOnly ? 'not-allowed' : 'pointer',
                      opacity:      isReadOnly ? 0.45 : 1,
                      display:      'flex',
                      alignItems:   'center',
                      gap:          7,
                      boxShadow:    isReadOnly ? 'none' : '0 2px 8px rgba(20,184,166,0.3)',
                      flexShrink:   0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5"  y1="12" x2="19" y2="12" />
                    </svg>
                    Add New Client
                  </button>
                )}
                <HelpButton page="clients" />
              </div>
            </div>

            {/* Operation error banner */}
            {opError && (
              <div style={{
                background:   '#fee2e2',
                border:       '1px solid #fca5a5',
                borderRadius: 8,
                padding:      '10px 14px',
                marginBottom: 16,
                fontSize:     13,
                color:        '#dc2626',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'space-between',
                gap:          12,
              }}>
                <span>⚠ {opError}</span>
                <button
                  onClick={() => setOpError('')}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
                >×</button>
              </div>
            )}

            {/* Search bar */}
            {clients.length > 0 && (
              <div style={{ position: 'relative', maxWidth: isMobile ? '100%' : 380, marginBottom: isMobile ? 12 : 16 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
                  style={{
                    position:      'absolute',
                    left:          12,
                    top:           '50%',
                    transform:     'translateY(-50%)',
                    pointerEvents: 'none',
                  }}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by business name, email or phone…"
                  style={{ ...INPUT, paddingLeft: 36, background: '#fff', minHeight: isMobile ? 44 : undefined }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{
                      position:   'absolute',
                      right:      10,
                      top:        '50%',
                      transform:  'translateY(-50%)',
                      background: 'none',
                      border:     'none',
                      color:      '#94a3b8',
                      cursor:     'pointer',
                      fontSize:   18,
                      lineHeight: 1,
                      padding:    2,
                    }}
                  >×</button>
                )}
              </div>
            )}

            {/* Show archived toggle */}
            {clients.some(c => c.is_archived) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: isMobile ? 12 : 16, width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={e => setShowArchived(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#14b8a6', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Show archived clients</span>
              </label>
            )}

            {/* Client list */}
            {!loading && visibleClients.length === 0 ? (
              search ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>
                    No results for "{search}"
                  </p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>
                    Try a different name, company, or email.
                  </p>
                </div>
              ) : (
                <EmptyState onAdd={openAdd} />
              )
            ) : isMobile ? (
              /* Mobile: card list */
              <div>
                {visibleClients.map(client => (
                  <MobileClientCard
                    key={client.id}
                    client={client}
                    onEdit={openEdit}
                    onViewInvoices={c => openDetailWithTab(c, 'invoices')}
                    onViewEstimates={c => openDetailWithTab(c, 'estimates')}
                    onDelete={openDeleteFlow}
                    onUnarchive={handleUnarchive}
                    isReadOnly={isReadOnly}
                  />
                ))}
              </div>
            ) : (
              /* Desktop: table (unchanged) */
              <div className="clients-table" style={{
                background:   '#fff',
                border:       '1px solid #e2e8f0',
                borderRadius: 12,
                overflow:     'hidden',
                boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                      {[
                        { label: 'Business Name',  w: 'auto' },
                        { label: 'Email',          w: 200 },
                        { label: 'Phone',          w: 140 },
                        { label: 'Invoices',       w: 80  },
                        { label: 'Total Invoiced', w: 130 },
                        { label: '',               w: 40  },
                      ].map(({ label, w }) => (
                        <th key={label} style={{
                          width:         w,
                          padding:       '11px 16px',
                          textAlign:     'left',
                          fontSize:      11,
                          fontWeight:    700,
                          color:         '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          whiteSpace:    'nowrap',
                        }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleClients.map((client, i) => (
                      <tr
                        key={client.id}
                        onClick={() => openDetail(client)}
                        style={{
                          borderTop:  i === 0 ? 'none' : '1px solid #f1f5f9',
                          cursor:     'pointer',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '' }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={client.company_name || client.name} size={34} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                              {client.company_name || client.name}
                            </span>
                            {client.is_archived && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>ARCHIVED</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#334155', maxWidth: 200 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {client.email}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {client.phone || <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {(clientStats[client.id]?.count ?? 0) > 0 ? (
                            <span style={{ background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, border: '1px solid #dcfce7' }}>
                              {clientStats[client.id].count}
                            </span>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: (clientStats[client.id]?.total ?? 0) > 0 ? '#0f172a' : '#cbd5e1', whiteSpace: 'nowrap' }}>
                          {(clientStats[client.id]?.total ?? 0) > 0 ? formatZAR(clientStats[client.id].total) : '—'}
                        </td>
                        <td style={{ padding: '14px 12px', color: '#cbd5e1', textAlign: 'center' }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* FAB — mobile only */}
            {isMobile && !isReadOnly && (
              <button
                onClick={openAdd}
                title="Add New Client"
                style={{
                  position:       'fixed',
                  bottom:         80,
                  right:          16,
                  width:          56,
                  height:         56,
                  borderRadius:   '50%',
                  background:     'var(--primary, #14b8a6)',
                  color:          '#fff',
                  border:         'none',
                  boxShadow:      '0 4px 20px rgba(0,0,0,0.24)',
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  zIndex:         50,
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            )}
          </>
        )}

        {/* ════════════════════════ DETAIL VIEW ══════════════════════════ */}
        {view === 'detail' && selected && (
          <>
            {/* Back + actions bar */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              marginBottom:   isMobile ? 14 : 24,
              gap:            8,
            }}>
              <button
                onClick={goBack}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: '#64748b', fontSize: 14, fontWeight: 500, padding: 0,
                  transition: 'color 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#0f172a' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#64748b' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                {isMobile ? 'Back' : 'Back to Clients'}
              </button>

              {!isReadOnly && (
                /* On mobile: buttons fill the remaining space equally (50/50) */
                <div style={{ display: 'flex', gap: 8, flex: isMobile ? 1 : undefined, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => openEdit(selected)}
                    style={{
                      background: '#fff', border: '1.5px solid #e2e8f0', color: '#374151',
                      borderRadius: 8,
                      padding:     isMobile ? '0 16px' : '8px 16px',
                      minHeight:   isMobile ? 44 : undefined,
                      flex:        isMobile ? 1 : undefined,
                      fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: isMobile ? 'center' : undefined,
                      gap: 6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
                    </svg>
                    Edit
                  </button>
                  {selected.is_archived ? (
                    <button
                      onClick={() => handleUnarchive(selected)}
                      disabled={unarchivingId === selected.id}
                      style={{
                        background: '#fff', border: '1.5px solid #14b8a6', color: '#0f766e',
                        borderRadius: 8,
                        padding:     isMobile ? '0 16px' : '8px 16px',
                        minHeight:   isMobile ? 44 : undefined,
                        flex:        isMobile ? 1 : undefined,
                        fontSize: 13, fontWeight: 600,
                        cursor: unarchivingId === selected.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: isMobile ? 'center' : undefined,
                        gap: 6,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                      {unarchivingId === selected.id ? 'Unarchiving…' : 'Unarchive'}
                    </button>
                  ) : (
                    <button
                      onClick={() => openDeleteFlow(selected)}
                      disabled={checkingDelete}
                      style={{
                        background: '#fff', border: '1.5px solid #fca5a5', color: '#dc2626',
                        borderRadius: 8,
                        padding:     isMobile ? '0 16px' : '8px 16px',
                        minHeight:   isMobile ? 44 : undefined,
                        flex:        isMobile ? 1 : undefined,
                        fontSize: 13, fontWeight: 600,
                        cursor: checkingDelete ? 'wait' : 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: isMobile ? 'center' : undefined,
                        gap: 6,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                      {checkingDelete ? 'Checking…' : 'Delete'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Client info card */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: isMobile ? '20px 16px 0' : '24px 28px',
              marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}>
              {isMobile ? (
                /* ── Mobile: stacked layout ── */
                <>
                  {/* Avatar + name + contact info — centered */}
                  <div style={{ textAlign: 'center', paddingBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                      <Avatar name={selected.company_name || selected.name} size={56} />
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {selected.company_name || selected.name}
                      {selected.is_archived && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: 999 }}>ARCHIVED</span>
                      )}
                    </h2>
                    {selected.email && (
                      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 3 }}>{selected.email}</div>
                    )}
                    {selected.phone && (
                      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 3 }}>{selected.phone}</div>
                    )}
                    {selected.address && (
                      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 3 }}>{selected.address}</div>
                    )}
                    {selected.website && (
                      <a href={selected.website} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 13, color: '#14b8a6', textDecoration: 'none' }}>
                        {selected.website}
                      </a>
                    )}
                  </div>

                  {/* Stat boxes — side by side, full width, with divider */}
                  <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ flex: 1, padding: 14, textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
                        {docsLoading ? '—' : clientDocs.invoices.length}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>
                        Invoices
                      </div>
                    </div>
                    <div style={{ flex: 1, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#14b8a6', letterSpacing: '-0.3px' }}>
                        {docsLoading ? '—' : formatZAR(clientDocs.invoices.reduce((s, inv) => s + (Number(inv.total) || 0), 0))}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>
                        Total Invoiced
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* ── Desktop: horizontal layout (unchanged) ── */
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                  <Avatar name={selected.company_name || selected.name} size={60} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {selected.company_name || selected.name}
                      {selected.is_archived && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: 999 }}>ARCHIVED</span>
                      )}
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                      <InfoRow
                        icon="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 0l8 8 8-8"
                        text={selected.email}
                      />
                      <InfoRow
                        icon="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.58 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                        text={selected.phone}
                      />
                      <InfoRow
                        icon="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0"
                        text={selected.address}
                      />
                      {selected.website && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                          <a
                            href={selected.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ color: '#14b8a6', textDecoration: 'none' }}
                          >
                            {selected.website}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                    <StatCard
                      value={docsLoading ? '—' : clientDocs.invoices.length}
                      label="Invoices"
                    />
                    <StatCard
                      value={docsLoading ? '—' : formatZAR(
                        clientDocs.invoices.reduce((s, inv) => s + (Number(inv.total) || 0), 0)
                      )}
                      label="Total Invoiced"
                      accent="#14b8a6"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Documents tabs card */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              {/* Tab strip — full width equal space on mobile */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                {[
                  { key: 'invoices',  label: 'Invoices',  count: clientDocs.invoices.length  },
                  { key: 'estimates', label: 'Estimates', count: clientDocs.estimates.length },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      flex:         isMobile ? 1 : undefined,
                      justifyContent: isMobile ? 'center' : undefined,
                      background:   'none', border: 'none', cursor: 'pointer',
                      padding:      '13px 20px', fontSize: isMobile ? 13 : 13, fontWeight: 600,
                      color:        activeTab === tab.key ? '#14b8a6' : '#64748b',
                      borderBottom: activeTab === tab.key ? '2px solid #14b8a6' : '2px solid transparent',
                      marginBottom: -1,
                      display:      'flex', alignItems: 'center', gap: 8, transition: 'color 0.15s',
                    }}
                  >
                    {tab.label}
                    <span style={{
                      background: activeTab === tab.key ? '#f0fdfa' : '#f1f5f9',
                      color:      activeTab === tab.key ? '#14b8a6' : '#94a3b8',
                      fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                    }}>
                      {docsLoading ? '…' : tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {docsLoading ? (
                <div style={{ padding: '44px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  Loading…
                </div>
              ) : (() => {
                const isInv = activeTab === 'invoices'
                const docs  = isInv ? clientDocs.invoices : clientDocs.estimates

                if (docs.length === 0) {
                  return (
                    <div style={{ padding: '44px 20px', textAlign: 'center' }}>
                      <p style={{ fontSize: 14, color: '#94a3b8' }}>
                        No {activeTab} found for this client.
                      </p>
                    </div>
                  )
                }

                // ── Mobile: card list ──
                if (isMobile) {
                  return (
                    <div style={{ padding: '10px 12px' }}>
                      {docs.map(doc => {
                        const docNumber = isInv ? doc.invoice_number : doc.estimate_number
                        const dateLabel = isInv ? 'Due' : 'Exp'
                        const dateVal   = isInv ? doc.due_date : doc.expiry_date
                        return (
                          <div key={doc.id} style={{
                            background:   '#fff',
                            border:       '1px solid #f1f5f9',
                            borderRadius: 8,
                            padding:      14,
                            marginBottom: 8,
                            boxShadow:    '0 1px 3px rgba(0,0,0,0.05)',
                          }}>
                            {/* Top row: number + status badge */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                                {docNumber}
                              </span>
                              <StatusBadge status={doc.status} />
                            </div>
                            {/* Dates row */}
                            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                              <span>Issued: {fmtDate(doc.issue_date)}</span>
                              {dateVal && <span>{dateLabel}: {fmtDate(dateVal)}</span>}
                            </div>
                            {/* Amount */}
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary, #14b8a6)' }}>
                              {formatZAR(doc.total)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                }

                // ── Desktop: table (unchanged) ──
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                        {['Number', 'Issue Date', isInv ? 'Due Date' : 'Expiry', 'Status', 'Total', ''].map(h => (
                          <th key={h} style={{
                            padding: '10px 16px', textAlign: 'left',
                            fontSize: 11, fontWeight: 700, color: '#94a3b8',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((doc, i) => (
                        <tr key={doc.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>
                          <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                            {isInv ? doc.invoice_number : doc.estimate_number}
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 13, color: '#64748b' }}>
                            {fmtDate(doc.issue_date)}
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 13, color: '#64748b' }}>
                            {fmtDate(isInv ? doc.due_date : doc.expiry_date)}
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <StatusBadge status={doc.status} />
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {formatZAR(doc.total)}
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <button
                              style={{
                                background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b',
                                borderRadius: 6, padding: '4px 13px', fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', transition: 'background 0.1s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc' }}
                              onClick={() => { /* TODO: open invoice/estimate detail */ }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════ SLIDE-IN PANEL ═══════════════════════════ */}
      {/* Desktop: slides in from the right. Mobile: slides up from the bottom. */}
      <div style={{
        position:      'fixed',
        top:           isMobile ? 'auto' : 0,
        bottom:        isMobile ? 0 : 'auto',
        right:         0,
        left:          isMobile ? 0 : 'auto',
        width:         isMobile ? '100%' : 440,
        // Mobile: fixed 90vh so the flex body (flex:1 overflowY:auto) + footer (flexShrink:0)
        // layout works correctly and the Save button is always visible.
        height:        isMobile ? '90vh' : '100%',
        borderRadius:  isMobile ? '20px 20px 0 0' : 0,
        background:    '#fff',
        boxShadow:     isMobile ? '0 -4px 32px rgba(0,0,0,0.12)' : '-4px 0 32px rgba(0,0,0,0.1)',
        transform:     panelOpen
          ? 'translate(0,0)'
          : isMobile ? 'translateY(100%)' : 'translateX(100%)',
        transition:    'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
        zIndex:        50,
        display:       'flex',
        flexDirection: 'column',
      }}>
        {/* Drag handle — mobile only */}
        {isMobile && (
          <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '12px auto 0' }} />
        )}

        {/* Panel header */}
        <div style={{
          padding:        isMobile ? '16px 20px 14px' : '20px 24px',
          borderBottom:   '1px solid #f1f5f9',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          flexShrink:     0,
        }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 1 }}>
              {editingClient ? 'Edit Client' : 'New Client'}
            </h2>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              {editingClient ? 'Update the client details below' : 'Fill in the details to add a new client'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  height: 34, padding: '0 14px', border: 'none', borderRadius: 8,
                  background: saving ? '#5eead4' : '#14b8a6',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: saving ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(20,184,166,0.3)',
                  whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            <button
              onClick={closePanel}
              style={{
                background:     '#f1f5f9', border: 'none', borderRadius: '50%',
                width:          32, height: 32, cursor: 'pointer',
                display:        'flex', alignItems: 'center', justifyContent: 'center',
                color:          '#64748b', fontSize: 18, lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {errors._global && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
              padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#dc2626',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>⚠</span> {errors._global}
            </div>
          )}

          <PanelField label="Business Name" required error={errors.company_name}>
            <input
              ref={firstInputRef}
              style={{ ...INPUT, borderColor: errors.company_name ? '#fca5a5' : '#e2e8f0' }}
              value={form.company_name}
              placeholder="Acme Ltd"
              onChange={setField('company_name')}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </PanelField>

          <PanelField label="Email Address" error={errors.email}>
            <input
              type="email"
              style={{ ...INPUT, borderColor: errors.email ? '#fca5a5' : '#e2e8f0' }}
              value={form.email}
              placeholder="john@acme.com"
              onChange={setField('email')}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </PanelField>

          <PanelField label="Phone">
            <input
              style={INPUT}
              value={form.phone}
              placeholder="+27 21 000 0000  (optional)"
              onChange={setField('phone')}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </PanelField>

          <PanelField label="Address">
            <textarea
              style={{ ...INPUT, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
              value={form.address}
              placeholder={'123 Main Street\nCape Town, 8001  (optional)'}
              onChange={setField('address')}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </PanelField>

          <PanelField label="Website">
            <input
              style={INPUT}
              value={form.website}
              placeholder="https://acme.com  (optional)"
              onChange={setField('website')}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </PanelField>

          {editingClient && (
            <div style={{ marginTop: 8, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Additional Contacts</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Automatically CC'd on every invoice and quote sent to this client.</p>
                </div>
                <button
                  onClick={() => setContactModal('new')}
                  style={{
                    padding: '7px 12px', borderRadius: 8, border: '1.5px solid #14b8a6',
                    background: '#fff', color: '#14b8a6', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  + Add Contact
                </button>
              </div>

              {contactsLoading ? (
                <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>
              ) : contacts.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8' }}>No additional contacts yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contacts.map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name || c.email}{c.role ? ` — ${c.role}` : ''}
                        </p>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.email}{c.phone ? ` · ${c.phone}` : ''}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => setContactModal(c)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
                          title="Edit contact"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteContactConfirm(c)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                          title="Delete contact"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel footer — fixed save button */}
        <div style={{
          padding:    isMobile ? '14px 20px calc(14px + env(safe-area-inset-bottom))' : '16px 24px',
          borderTop:  '1px solid #f1f5f9',
          display:    'flex',
          gap:        10,
          flexShrink: 0,
          background: '#fff',
        }}>
          <button
            onClick={closePanel}
            style={{
              flex: 1, background: '#f8fafc', border: '1.5px solid #e2e8f0',
              color: '#374151', borderRadius: 8, padding: '10px 0',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex:       2,
              background: saving ? '#5eead4' : '#14b8a6',
              border:     'none',
              color:      '#fff',
              borderRadius: 8,
              padding:    '10px 0',
              fontSize:   14,
              fontWeight: 600,
              cursor:     saving ? 'wait' : 'pointer',
              transition: 'background 0.15s',
              boxShadow:  saving ? 'none' : '0 2px 6px rgba(20,184,166,0.3)',
              minHeight:  44,
            }}
          >
            {saving ? 'Saving…' : editingClient ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </div>

      {/* ════════════════════════ DELETE MODAL ═════════════════════════════ */}
      {confirmDelete && selected && (
        <DeleteModal
          clientName={selected.company_name || selected.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* ═══════════════════ ARCHIVE-INSTEAD MODAL ══════════════════════════ */}
      {archiveConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 400, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Archive Client?</h3>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
              This client has invoice history and can't be permanently deleted. Would you like to archive them instead?
              Archived clients are hidden from your client list but their invoice history stays intact.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setArchiveConfirm(null)} disabled={archiving}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: archiving ? 'wait' : 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleArchiveConfirm} disabled={archiving}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: archiving ? 'wait' : 'pointer' }}>
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ ADD/EDIT CONTACT MODAL ═════════════════════════ */}
      {contactModal && (
        <ClientContactModal
          contact={contactModal === 'new' ? null : contactModal}
          onSave={handleSaveContact}
          onClose={() => setContactModal(null)}
        />
      )}

      {/* ═══════════════════ DELETE CONTACT CONFIRM ══════════════════════════ */}
      {deleteContactConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 340, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Delete Contact?</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>
              Delete <strong>{deleteContactConfirm.name || deleteContactConfirm.email}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteContactConfirm(null)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeleteContact}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
