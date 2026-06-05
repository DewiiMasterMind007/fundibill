import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'
import { generateTestEmail, PLAIN_TEXT_FOOTER } from '../lib/emailTemplates'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_TERMS = [
  { value: '7',      label: '7 days'  },
  { value: '14',     label: '14 days' },
  { value: '30',     label: '30 days' },
  { value: 'custom', label: 'Custom'  },
]

const DEFAULTS = {
  business_name:           '',
  business_address:        '',
  email:                   '',
  phone:                   '',
  vat_number:              '',
  logo_path:               '',
  primary_color:           '#14b8a6',
  accent_color:            '#0f172a',
  text_color:              '#1e293b',
  invoice_prefix:          'INV-',
  estimate_prefix:         'EST-',
  starting_invoice_number:  1,
  starting_estimate_number: 1,
  default_payment_terms:   '30',
  terms_conditions:        '',
  banking_details:         '',
  payment_methods:         null,
  default_payment_method:  null,
  smtp_host:               '',
  smtp_port:               '',
  smtp_user:               '',
  smtp_password:           '',
  smtp_from_name:          '',
  payment_terms_days:      7,
}

// Maps form field names → Supabase profiles column names.
// All settings are now persisted exclusively to the profiles table.
const SUPABASE_COL = {
  business_name:            'business_name',
  business_address:         'address',
  email:                    'email',
  phone:                    'phone',
  vat_number:               'vat_number',
  logo_path:                'logo_url',
  primary_color:            'primary_color',
  accent_color:             'accent_color',
  text_color:               'text_color',
  invoice_prefix:           'invoice_prefix',
  estimate_prefix:          'estimate_prefix',
  starting_invoice_number:  'starting_invoice_number',
  starting_estimate_number: 'starting_estimate_number',
  default_payment_terms:    'default_payment_terms',
  default_payment_method:   'default_payment_method',
  terms_conditions:         'terms',
  banking_details:          'banking_details',
  smtp_host:                'smtp_host',
  smtp_port:                'smtp_port',
  smtp_user:                'smtp_user',
  smtp_password:            'smtp_password',
  smtp_from_name:           'smtp_from_name',
  payment_terms_days:       'payment_terms_days',
}

const BUILTIN_METHODS = ['Cash', 'EFT / Bank Transfer', 'Credit Card', 'Debit Card']

function parseMethods(raw) {
  if (!raw) return [...BUILTIN_METHODS]
  try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p } catch (_) {}
  return [...BUILTIN_METHODS]
}

const BUILTIN_CATEGORIES = [
  'Office Supplies', 'Rent', 'Utilities', 'Software & Subscriptions',
  'Travel', 'Marketing', 'Equipment', 'Professional Services',
  'Meals & Entertainment', 'Other',
]

function parseCategories(raw) {
  if (!raw) return [...BUILTIN_CATEGORIES]
  try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) return p } catch (_) {}
  return [...BUILTIN_CATEGORIES]
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT = {
  width:        '100%',
  background:   '#f8fafc',
  border:       '1.5px solid #e2e8f0',
  borderRadius: 8,
  color:        '#0f172a',
  fontSize:     14,
  padding:      '9px 12px',
  outline:      'none',
  transition:   'border-color 0.15s',
  fontFamily:   'inherit',
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ visible }) {
  return (
    <div style={{
      position:   'fixed',
      bottom:     28,
      right:      28,
      background: '#0f172a',
      color:      '#4ade80',
      border:     '1px solid rgba(74,222,128,0.25)',
      borderRadius: 8,
      padding:    '8px 16px',
      fontSize:   13,
      fontWeight: 600,
      display:    'flex',
      alignItems: 'center',
      gap:        7,
      opacity:    visible ? 1 : 0,
      transform:  visible ? 'translateY(0)' : 'translateY(10px)',
      transition: 'opacity 0.2s, transform 0.2s',
      pointerEvents: 'none',
      zIndex:     200,
      boxShadow:  '0 4px 16px rgba(0,0,0,0.2)',
    }}>
      <span style={{ fontSize: 15 }}>✓</span> Saved
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Section({ title, badge, description, children }) {
  return (
    <div style={{
      background:   '#ffffff',
      border:       '1px solid #e2e8f0',
      borderRadius: 12,
      overflow:     'hidden',
      marginBottom: 20,
      boxShadow:    '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        padding:      '14px 24px',
        borderBottom: '1px solid #f1f5f9',
        background:   '#f8fafc',
        display:      'flex',
        alignItems:   'center',
        gap:          10,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{title}</h2>
            {badge && (
              <span style={{
                background:    '#fef3c7',
                color:         '#92400e',
                fontSize:      10,
                fontWeight:    700,
                padding:       '2px 8px',
                borderRadius:  999,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                border:        '1px solid #fde68a',
              }}>
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{description}</p>
          )}
        </div>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, hint, children, style = {} }) {
  return (
    <div style={{ ...style }}>
      <label style={{
        display:    'block',
        fontSize:   13,
        fontWeight: 500,
        color:      '#374151',
        marginBottom: 6,
      }}>
        {label}
        {hint && (
          <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 6, fontSize: 12 }}>
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  )
}

// ─── Color picker ─────────────────────────────────────────────────────────────

function ColorPicker({ label, value, onChange, onBlur }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Swatch — clicking it opens the native color picker */}
        <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
          <div style={{
            width:        44,
            height:       44,
            borderRadius: 10,
            background:   value,
            border:       '2px solid #e2e8f0',
            boxShadow:    '0 2px 6px rgba(0,0,0,0.12)',
            transition:   'transform 0.1s',
          }} />
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={e  => onBlur && onBlur(e.target.value)}
            style={{
              position: 'absolute', opacity: 0,
              width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer',
            }}
          />
        </label>
        {/* Hex display */}
        <div style={{
          ...INPUT,
          flex:       1,
          fontFamily: 'ui-monospace, Consolas, monospace',
          color:      '#334155',
          display:    'flex',
          alignItems: 'center',
          gap:        8,
          cursor:     'default',
          padding:    '9px 12px',
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: 3,
            background: value, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0,
          }} />
          {(value || '').toUpperCase()}
        </div>
      </div>
    </Field>
  )
}

// ─── Invoice preview card ─────────────────────────────────────────────────────

function InvoicePreview({ form }) {
  const prefix  = form.invoice_prefix || 'INV-'
  const numStr  = String(form.starting_invoice_number || 1).padStart(4, '0')
  const primary = form.primary_color || '#14b8a6'

  const sampleItems = [
    { name: 'Design services',  desc: 'Brand identity package', qty: 1,  rate: 3500 },
    { name: 'Monthly retainer', desc: 'Ongoing support',         qty: 1,  rate: 1200 },
  ]
  const total = sampleItems.reduce((s, i) => s + i.qty * i.rate, 0)
  const fmtR  = (n) => {
    const [int, dec] = n.toFixed(2).split('.')
    return `R\u00a0${int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')},${dec}`
  }

  return (
    <div style={{
      border:       '1px solid #e2e8f0',
      borderRadius: 10,
      overflow:     'hidden',
      marginTop:    20,
      boxShadow:    '0 2px 8px rgba(0,0,0,0.06)',
      fontFamily:   'inherit',
    }}>
      {/* Preview label */}
      <div style={{
        padding: '7px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
        fontSize: 11, color: '#64748b', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Live Preview — Invoice Layout
      </div>

      <div style={{ background: '#fff', padding: '20px 24px' }}>

        {/* Header row: left = logo + biz info, right = INVOICE + number + dates */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          {/* Left */}
          <div style={{ flex: 1, maxWidth: 220 }}>
            {form.logo_path ? (
              <img
                src={form.logo_path}
                alt="logo"
                style={{ width: 48, height: 48, objectFit: 'contain', display: 'block', marginBottom: 8, borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 3 }}
              />
            ) : (
              <div style={{
                width: 48, height: 48, borderRadius: 6, background: primary + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 8, fontSize: 18, color: primary, fontWeight: 800,
              }}>
                {(form.business_name || 'B').charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              {form.business_name || 'Your Business'}
            </div>
            {form.business_address && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, whiteSpace: 'pre-line', lineHeight: 1.4 }}>
                {form.business_address}
              </div>
            )}
            {form.email && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{form.email}</div>}
            {form.phone && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{form.phone}</div>}
          </div>

          {/* Right */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: primary, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 8 }}>
              INVOICE
            </div>
            {[
              ['Invoice #', `${prefix}${numStr}`],
              ['Issue Date', new Date().toISOString().slice(0, 10)],
              ['Due Date',   new Date(Date.now() + 7*86400000).toISOString().slice(0, 10)],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 3, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', minWidth: 90, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Teal divider */}
        <div style={{ height: 2, background: primary, marginBottom: 14, borderRadius: 1 }} />

        {/* Bill To */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Bill To
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Client Name</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>client@example.com</div>
        </div>

        {/* Line items table */}
        <div style={{ borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 40px 90px 90px',
            background: primary, padding: '6px 10px', gap: 8,
          }}>
            {['Item Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
              <span key={h} style={{
                fontSize: 9, fontWeight: 700, color: '#fff', textTransform: 'uppercase',
                letterSpacing: '0.05em', textAlign: i > 0 ? 'right' : 'left',
              }}>{h}</span>
            ))}
          </div>
          {/* Rows */}
          {sampleItems.map((item, i) => (
            <div key={item.name} style={{
              display: 'grid', gridTemplateColumns: '1fr 40px 90px 90px',
              padding: '7px 10px', gap: 8, alignItems: 'start',
              background: i % 2 === 1 ? '#f8fafc' : '#fff',
              borderBottom: '1px solid #f1f5f9',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>{item.name}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{item.desc}</div>
              </div>
              <div style={{ fontSize: 11, color: '#475569', textAlign: 'right' }}>{item.qty}</div>
              <div style={{ fontSize: 11, color: '#475569', textAlign: 'right' }}>{fmtR(item.rate)}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>{fmtR(item.qty * item.rate)}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `2px solid ${primary}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Total</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: primary }}>{fmtR(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Settings() {
  const trialStatus = useTrialStatus()
  const isReadOnly  = trialStatus?.isReadOnly ?? false
  const { user } = useAuth()
  const { refreshProfile } = useAppData()
  const [form, setForm]                   = useState(DEFAULTS)
  const [toastVisible, setToast]          = useState(false)
  const [saveError, setSaveError]         = useState('')
  const [saving, setSaving]               = useState(false)
  const [payMethods, setPayMethods]       = useState(BUILTIN_METHODS)
  const [newMethod, setNewMethod]         = useState('')
  const [expCategories, setExpCategories] = useState(BUILTIN_CATEGORIES)
  const [newCategory, setNewCategory]     = useState('')
  const [testEmailStatus, setTestEmailStatus] = useState(null) // null | 'sending' | 'success' | 'error'
  const [testEmailMsg, setTestEmailMsg]   = useState('')
  const toastTimer  = useRef(null)
  const logoRef     = useRef(null)

  // ── Load on mount: Supabase profile ──────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!user) return
      const { data: rows, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1)

      if (error) {
        console.error('[settings] load profile:', error.message)
        return
      }

      const profile = rows?.[0] ?? null
      if (!profile) return

      setForm(prev => ({
        ...prev,
        business_name:            profile.business_name            ?? prev.business_name,
        business_address:         profile.address                  ?? prev.business_address,
        email:                    profile.email                    ?? prev.email,
        phone:                    profile.phone                    ?? prev.phone,
        vat_number:               profile.vat_number               ?? prev.vat_number,
        logo_path:                profile.logo_url                 ?? prev.logo_path,
        primary_color:            profile.primary_color            ?? prev.primary_color,
        accent_color:             profile.accent_color             ?? prev.accent_color,
        text_color:               profile.text_color               ?? prev.text_color,
        invoice_prefix:           profile.invoice_prefix           ?? prev.invoice_prefix,
        estimate_prefix:          profile.estimate_prefix          ?? prev.estimate_prefix,
        starting_invoice_number:  profile.starting_invoice_number  ?? prev.starting_invoice_number,
        starting_estimate_number: profile.starting_estimate_number ?? prev.starting_estimate_number,
        default_payment_terms:    profile.default_payment_terms    ?? prev.default_payment_terms,
        default_payment_method:   profile.default_payment_method   ?? prev.default_payment_method,
        terms_conditions:         profile.terms                    ?? prev.terms_conditions,
        banking_details:          profile.banking_details          ?? prev.banking_details,
        smtp_host:                profile.smtp_host                ?? prev.smtp_host,
        smtp_port:                profile.smtp_port                ?? prev.smtp_port,
        smtp_user:                profile.smtp_user                ?? prev.smtp_user,
        smtp_password:            profile.smtp_password            ?? prev.smtp_password,
        smtp_from_name:           profile.smtp_from_name           ?? prev.smtp_from_name,
        payment_terms_days:       profile.payment_terms_days       ?? prev.payment_terms_days,
      }))
      setPayMethods(parseMethods(profile.payment_methods))
      setExpCategories(parseCategories(profile.expense_categories))
    }
    load()
  }, [user])

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback(() => {
    setToast(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(false), 2200)
  }, [])

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleChange = (field) => (e) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleColor = (field) => (value) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setForm(prev => ({ ...prev, logo_path: ev.target.result }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleLogoRemove = () => setForm(prev => ({ ...prev, logo_path: '' }))

  // ── Save all fields ───────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      if (user) {
        const profileData = { id: user.id }
        for (const [field, col] of Object.entries(SUPABASE_COL)) {
          const v = form[field]
          // Send null for empty strings (avoids type errors on integer columns)
          profileData[col] = (v === '' || v === null || v === undefined) ? null : v
        }
        // Include payment methods and expense categories (managed outside the form object)
        profileData.payment_methods    = JSON.stringify(payMethods)
        profileData.expense_categories = JSON.stringify(expCategories)
        // Ensure integer columns receive actual integers, not strings from number inputs
        if (profileData.payment_terms_days != null) profileData.payment_terms_days = parseInt(profileData.payment_terms_days, 10) || 7

        const { error: profileError } = await supabase.from('profiles').upsert(profileData, { onConflict: 'id' })
        if (profileError) throw new Error(profileError.message)

        // Keep AppDataContext in sync so UI colours + settings update immediately
        refreshProfile()
      }

      showToast()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Test Email ───────────────────────────────────────────────────────────
  const sendTestEmail = async () => {
    const smtp = {
      host:      form.smtp_host     || '',
      port:      form.smtp_port     || '587',
      user:      form.smtp_user     || '',
      password:  form.smtp_password || '',
      from_name: form.smtp_from_name || form.business_name || '',
    }
    if (!smtp.host || !smtp.user || !smtp.password) {
      setTestEmailMsg('Fill in SMTP Host, Username, and Password first.')
      setTestEmailStatus('error')
      return
    }
    setTestEmailStatus('sending')
    setTestEmailMsg('')
    const html = generateTestEmail({
      businessName: form.business_name || '',
      primaryColor: form.primary_color || '#14b8a6',
    })
    const res = await window.db?.email?.send({
      smtp,
      to:      smtp.user,
      subject: 'FundiBill — Test Email',
      text:    'This is a test email from FundiBill. Your email settings are configured correctly.' + PLAIN_TEXT_FOOTER,
      html,
    })
    if (res?.success) {
      setTestEmailStatus('success')
      setTestEmailMsg(`Test email sent to ${smtp.user}`)
    } else {
      setTestEmailStatus('error')
      setTestEmailMsg(res?.error || 'Failed to send. Check your SMTP settings.')
    }
  }

  // ── Shared focus style ────────────────────────────────────────────────────
  const focusStyle = (e) => { e.currentTarget.style.borderColor = '#14b8a6' }
  const blurStyle  = (e) => { e.currentTarget.style.borderColor = '#e2e8f0' }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      padding:    '32px 32px 64px',
      maxWidth:   820,
      overflowY:  'auto',
      height:     '100%',
    }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Settings
        </h1>
        <HelpButton page="settings" />
      </div>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: saveError ? 16 : 28 }}>
        Manage your business profile, branding, and document preferences.
      </p>

      {saveError && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '10px 14px', marginBottom: 24, fontSize: 13, color: '#dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>⚠ {saveError}</span>
          <button onClick={() => setSaveError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* ── BUSINESS PROFILE ─────────────────────────────────────────────── */}
      <Section title="Business Profile" description="Appears on all invoices and estimates">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <Field label="Business Name">
            <input
              style={INPUT} value={form.business_name} placeholder="Acme Studio"
              onChange={handleChange('business_name')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="Email Address">
            <input
              style={INPUT} value={form.email} type="email" placeholder="billing@yourbusiness.com"
              onChange={handleChange('email')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="Business Address" style={{ gridColumn: '1 / -1' }}>
            <textarea
              style={{ ...INPUT, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
              value={form.business_address}
              placeholder="123 Main Street&#10;Cape Town, 8001&#10;South Africa"
              onChange={handleChange('business_address')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="Contact Number">
            <input
              style={INPUT} value={form.phone} placeholder="+27 21 000 0000"
              onChange={handleChange('phone')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="VAT Number" hint="optional">
            <input
              style={INPUT} value={form.vat_number} placeholder="4010000000"
              onChange={handleChange('vat_number')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          {/* Logo upload */}
          <Field label="Business Logo" hint="PNG or JPG, square recommended (e.g. 200 × 200 px)" style={{ gridColumn: '1 / -1' }}>
            <div
              onClick={() => logoRef.current?.click()}
              style={{
                border:      '2px dashed #e2e8f0',
                borderRadius: 10,
                padding:     '16px 20px',
                cursor:      'pointer',
                display:     'flex',
                alignItems:  'center',
                gap:         16,
                background:  '#f8fafc',
                transition:  'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#14b8a6'
                e.currentTarget.style.background  = '#f0fdfa'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.background  = '#f8fafc'
              }}
            >
              {form.logo_path ? (
                <>
                  <img
                    src={form.logo_path}
                    alt="Business logo"
                    style={{ height: 52, maxWidth: 160, objectFit: 'contain', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', padding: 4 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Logo uploaded</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Click to replace</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    width: 48, height: 48, borderRadius: 10, background: '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Upload your logo</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Click to select a PNG or JPG file</div>
                  </div>
                </>
              )}
            </div>

            {form.logo_path && (
              <button
                onClick={e => { e.stopPropagation(); handleLogoRemove() }}
                style={{
                  marginTop:    8,
                  background:   'transparent',
                  border:       '1px solid #fca5a5',
                  color:        '#ef4444',
                  borderRadius: 6,
                  padding:      '4px 12px',
                  fontSize:     12,
                  fontWeight:   500,
                  cursor:       'pointer',
                }}
              >
                Remove logo
              </button>
            )}

            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              style={{ display: 'none' }}
              onChange={handleLogoChange}
            />
          </Field>
        </div>
      </Section>

      {/* ── APPEARANCE ───────────────────────────────────────────────────── */}
      <Section title="Appearance" description="Controls the colour scheme of your generated documents">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ColorPicker
            label="Primary Color"
            value={form.primary_color}
            onChange={handleColor('primary_color')}
          />
          <ColorPicker
            label="Accent Color"
            value={form.accent_color}
            onChange={handleColor('accent_color')}
          />
        </div>

        <InvoicePreview form={form} />
      </Section>

      {/* ── DOCUMENT SETTINGS ────────────────────────────────────────────── */}
      <Section title="Document Settings" description="Numbering, prefixes, and default terms">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <Field label="Invoice Prefix">
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                style={{ ...INPUT, borderRadius: '8px 0 0 8px', flex: 1 }}
                value={form.invoice_prefix}
                placeholder="INV-"
                onChange={handleChange('invoice_prefix')}
                onBlur={blurStyle}
                onFocus={focusStyle}
              />
              <div style={{
                background:   '#f1f5f9',
                border:       '1.5px solid #e2e8f0',
                borderLeft:   'none',
                borderRadius: '0 8px 8px 0',
                padding:      '9px 12px',
                fontSize:     13,
                color:        '#64748b',
                fontFamily:   'ui-monospace, Consolas, monospace',
                whiteSpace:   'nowrap',
              }}>
                {(form.invoice_prefix || 'INV-')}{String(form.starting_invoice_number || 1).padStart(4, '0')}
              </div>
            </div>
          </Field>

          <Field label="Estimate Prefix">
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                style={{ ...INPUT, borderRadius: '8px 0 0 8px', flex: 1 }}
                value={form.estimate_prefix}
                placeholder="EST-"
                onChange={handleChange('estimate_prefix')}
                onBlur={blurStyle}
                onFocus={focusStyle}
              />
              <div style={{
                background:   '#f1f5f9',
                border:       '1.5px solid #e2e8f0',
                borderLeft:   'none',
                borderRadius: '0 8px 8px 0',
                padding:      '9px 12px',
                fontSize:     13,
                color:        '#64748b',
                fontFamily:   'ui-monospace, Consolas, monospace',
                whiteSpace:   'nowrap',
              }}>
                {(form.estimate_prefix || 'EST-')}{String(form.starting_estimate_number || 1).padStart(4, '0')}
              </div>
            </div>
          </Field>

          <Field label="Starting Invoice Number">
            <input
              style={INPUT} type="number" min={1}
              value={form.starting_invoice_number}
              onChange={handleChange('starting_invoice_number')}
              onBlur={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setForm(p => ({ ...p, starting_invoice_number: v })); blurStyle(e) }}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="Starting Estimate Number">
            <input
              style={INPUT} type="number" min={1}
              value={form.starting_estimate_number}
              onChange={handleChange('starting_estimate_number')}
              onBlur={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setForm(p => ({ ...p, starting_estimate_number: v })); blurStyle(e) }}
              onFocus={focusStyle}
            />
          </Field>

        </div>
      </Section>

      {/* ── PAYMENT & REMINDERS ─────────────────────────────────────────── */}
      <Section title="Payment & Reminders" description="Default payment terms and reminder bell settings">
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Default payment terms (days)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={1} max={365}
              style={{ ...INPUT, width: 100 }}
              value={form.payment_terms_days}
              onChange={handleChange('payment_terms_days')}
              onBlur={e => {
                const v = Math.max(1, parseInt(e.target.value, 10) || 7)
                setForm(p => ({ ...p, payment_terms_days: v }))
                blurStyle(e)
              }}
              onFocus={focusStyle}
            />
            <span style={{ fontSize: 13, color: '#64748b' }}>days</span>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '5px 0 0' }}>
            Invoices overdue by more than {form.payment_terms_days || 7} days will show a reminder bell icon
            so you can send a manual reminder.
          </p>
        </div>
      </Section>

      {/* ── TERMS & CONDITIONS ───────────────────────────────────────────── */}
      <Section
        title="Terms & Conditions"
        description="Printed at the bottom of every invoice and estimate"
      >
        <textarea
          style={{ ...INPUT, minHeight: 140, resize: 'vertical', lineHeight: 1.6 }}
          value={form.terms_conditions}
          placeholder="e.g. Payment is due within the specified period. Late payments may incur a fee of 2% per month..."
          onChange={handleChange('terms_conditions')}
          onBlur={blurStyle}
          onFocus={focusStyle}
        />
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
          Supports plain text. Keep it concise — it will appear in the footer of each document.
        </p>
      </Section>

      {/* ── BANKING DETAILS ──────────────────────────────────────────────── */}
      <Section
        title="Banking Details"
        description="Displayed on invoices to help clients make payment"
      >
        <textarea
          style={{ ...INPUT, minHeight: 120, resize: 'vertical', lineHeight: 1.6 }}
          value={form.banking_details}
          placeholder={'Bank: First National Bank\nAccount Name: Acme Studio\nAccount Number: 62000000000\nBranch Code: 250655\nReference: Invoice number'}
          onChange={handleChange('banking_details')}
          onBlur={blurStyle}
          onFocus={focusStyle}
        />
      </Section>

      {/* ── EMAIL / SMTP ─────────────────────────────────────────────────── */}
      <Section title="Email Settings" description="SMTP configuration for sending invoices by email">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <Field label="SMTP Host">
            <input
              style={INPUT} value={form.smtp_host} placeholder="smtp.gmail.com"
              onChange={handleChange('smtp_host')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="SMTP Port">
            <input
              style={INPUT} value={form.smtp_port} placeholder="587"
              onChange={handleChange('smtp_port')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="From Email" hint="also used as SMTP username">
            <input
              style={INPUT} value={form.smtp_user} placeholder="you@gmail.com" type="email"
              onChange={handleChange('smtp_user')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="SMTP Password">
            <input
              style={INPUT} type="password" value={form.smtp_password} placeholder="••••••••"
              onChange={handleChange('smtp_password')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 5, lineHeight: 1.5 }}>
              Using Gmail? Use an <strong style={{ color: '#64748b' }}>App Password</strong> — not your regular password.{' '}
              Go to <em>Google Account → Security → App Passwords</em>.
            </p>
          </Field>

          <Field label="From Name" hint="shown as the sender on outgoing emails" style={{ gridColumn: '1 / -1' }}>
            <input
              style={{ ...INPUT, maxWidth: 360 }} value={form.smtp_from_name} placeholder="Acme Studio"
              onChange={handleChange('smtp_from_name')}
              onBlur={blurStyle}
              onFocus={focusStyle}
            />
          </Field>
        </div>

        {/* Test Email */}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            onClick={sendTestEmail}
            disabled={testEmailStatus === 'sending'}
            style={{
              padding: '9px 18px', borderRadius: 8, border: '1.5px solid #14b8a6',
              background: testEmailStatus === 'sending' ? '#f0fdfa' : '#fff',
              color: '#14b8a6', fontWeight: 600, fontSize: 13,
              cursor: testEmailStatus === 'sending' ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.15s',
            }}
          >
            {testEmailStatus === 'sending' ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'testEmailSpin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Sending…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Send Test Email
              </>
            )}
          </button>
          {testEmailStatus === 'success' && (
            <span style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {testEmailMsg}
            </span>
          )}
          {testEmailStatus === 'error' && (
            <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>⚠ {testEmailMsg}</span>
          )}
        </div>
        <style>{`@keyframes testEmailSpin { to { transform: rotate(360deg); } }`}</style>
      </Section>

      {/* ── SAVE BUTTON ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={isReadOnly ? undefined : handleSave}
          disabled={saving || isReadOnly}
          title={isReadOnly ? 'Your trial has ended. Upgrade to continue.' : undefined}
          style={{
            background:  isReadOnly ? '#94a3b8' : saving ? '#5eead4' : '#14b8a6',
            color:       '#fff',
            border:      'none',
            borderRadius: 8,
            padding:     '11px 28px',
            fontSize:    14,
            fontWeight:  600,
            cursor:      isReadOnly ? 'not-allowed' : saving ? 'wait' : 'pointer',
            opacity:     isReadOnly ? 0.55 : 1,
            boxShadow:   (saving || isReadOnly) ? 'none' : '0 2px 8px rgba(20,184,166,0.3)',
            transition:  'background 0.15s',
          }}
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {isReadOnly && (
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
            Settings are locked. Upgrade to make changes.
          </span>
        )}
      </div>

      {/* ── PAYMENT METHODS ──────────────────────────────────────────────── */}
      <Section title="Payment Methods" description="Payment options shown when marking invoices as paid">
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
          Configure the payment methods your clients can use. These appear as options when you mark an invoice as paid.
        </p>

        {/* Method list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {payMethods.map((method) => (
            <div key={method} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8,
              padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="radio"
                  name="defaultPayMethod"
                  checked={form.default_payment_method === method}
                  onChange={async () => {
                    setForm(p => ({ ...p, default_payment_method: method }))
                    await supabase.from('profiles').update({ default_payment_method: method }).eq('id', user.id)
                    showToast()
                  }}
                  style={{ accentColor: '#14b8a6', width: 16, height: 16 }}
                />
                <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{method}</span>
                {form.default_payment_method === method && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#14b8a6', background: '#f0fdfa', padding: '2px 7px', borderRadius: 999 }}>Default</span>
                )}
              </div>
              {payMethods.length > 1 && (
                <button
                  onClick={async () => {
                    const updated = payMethods.filter(m => m !== method)
                    setPayMethods(updated)
                    const newDefault = form.default_payment_method === method ? updated[0] || null : form.default_payment_method
                    setForm(p => ({ ...p, payment_methods: JSON.stringify(updated), default_payment_method: newDefault }))
                    await supabase.from('profiles').update({ payment_methods: JSON.stringify(updated), default_payment_method: newDefault }).eq('id', user.id)
                    showToast()
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add new method */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newMethod}
            onChange={e => setNewMethod(e.target.value)}
            onKeyDown={async e => {
              if (e.key !== 'Enter' || !newMethod.trim()) return
              const m = newMethod.trim()
              if (payMethods.includes(m)) return
              const updated = [...payMethods, m]
              setPayMethods(updated)
              setNewMethod('')
              const defaultM = form.default_payment_method || updated[0]
              setForm(p => ({ ...p, payment_methods: JSON.stringify(updated), default_payment_method: defaultM }))
              await supabase.from('profiles').update({ payment_methods: JSON.stringify(updated), default_payment_method: defaultM }).eq('id', user.id)
              showToast()
            }}
            placeholder="Type a payment method and press Enter…"
            style={{ ...INPUT, flex: 1 }}
            onFocus={focusStyle}
            onBlur={blurStyle}
          />
          <button
            onClick={async () => {
              const m = newMethod.trim()
              if (!m || payMethods.includes(m)) return
              const updated = [...payMethods, m]
              setPayMethods(updated)
              setNewMethod('')
              const defaultM = form.default_payment_method || updated[0]
              setForm(p => ({ ...p, payment_methods: JSON.stringify(updated), default_payment_method: defaultM }))
              await supabase.from('profiles').update({ payment_methods: JSON.stringify(updated), default_payment_method: defaultM }).eq('id', user.id)
              showToast()
            }}
            style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(20,184,166,0.3)' }}>
            Add Method
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          Select the radio button next to a method to set it as the default.
        </p>
      </Section>

      {/* ── EXPENSE CATEGORIES ───────────────────────────────────────────── */}
      <Section title="Expense Categories" description="Categories shown when recording expenses">
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
          Configure the categories available when adding expenses. These appear in the Expenses section.
        </p>

        {/* Category list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {expCategories.map((cat) => (
            <div key={cat} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8,
              padding: '10px 14px',
            }}>
              <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{cat}</span>
              {expCategories.length > 1 && (
                <button
                  onClick={async () => {
                    const updated = expCategories.filter(c => c !== cat)
                    setExpCategories(updated)
                    await supabase.from('profiles').update({ expense_categories: JSON.stringify(updated) }).eq('id', user.id)
                    showToast()
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add new category */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyDown={async e => {
              if (e.key !== 'Enter' || !newCategory.trim()) return
              const c = newCategory.trim()
              if (expCategories.includes(c)) return
              const updated = [...expCategories, c]
              setExpCategories(updated)
              setNewCategory('')
              await supabase.from('profiles').update({ expense_categories: JSON.stringify(updated) }).eq('id', user.id)
              showToast()
            }}
            placeholder="Type a category and press Enter…"
            style={{ ...INPUT, flex: 1 }}
            onFocus={focusStyle}
            onBlur={blurStyle}
          />
          <button
            onClick={async () => {
              const c = newCategory.trim()
              if (!c || expCategories.includes(c)) return
              const updated = [...expCategories, c]
              setExpCategories(updated)
              setNewCategory('')
              await supabase.from('profiles').update({ expense_categories: JSON.stringify(updated) }).eq('id', user.id)
              showToast()
            }}
            style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(20,184,166,0.3)' }}>
            Add Category
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          Removing a category does not affect existing expenses that used it.
        </p>
      </Section>

      <Toast visible={toastVisible} />
    </div>
  )
}
