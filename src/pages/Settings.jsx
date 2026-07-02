import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTrialStatus } from '../context/TrialContext'
import { useAppData } from '../context/AppDataContext'
import HelpButton from '../components/HelpButton'
import PasswordInput from '../components/PasswordInput'
import { generateTestEmail } from '../lib/emailTemplates'
import { sendEmail } from '../utils/sendEmail'
import useIsMobile from '../hooks/useIsMobile'
import PlanSelectModal from '../components/PlanSelectModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_TERMS = [
  { value: '7',      label: '7 days'  },
  { value: '14',     label: '14 days' },
  { value: '30',     label: '30 days' },
  { value: 'custom', label: 'Custom'  },
]

const DEFAULTS = {
  name:                    '',
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
  estimate_prefix:         'QT-',
  starting_invoice_number:  1,
  starting_estimate_number: 1,
  default_payment_terms:   '30',
  terms_conditions:        '',
  bank_name:               '',
  account_number:          '',
  branch_code:             '',
  payment_methods:         null,
  default_payment_method:  null,
  email_provider:           'smtp',
  smtp_host:                '',
  smtp_port:                '',
  smtp_user:                '',
  smtp_password:            '',
  smtp_from_name:           '',
  whatsapp_default_message:  'Hi {clientName}, please find invoice {invoiceNumber} for {amount} attached. Due date: {dueDate}. Thank you, {businessName}.',
  whatsapp_estimate_message: 'Hi {clientName}, please find your estimate {quoteNumber} attached for the amount of {amount}. This quote/estimate is valid until {expiryDate}. Thank you for your business! Kind regards, {businessName}',
  email_invoice_message:     'Hi {clientName}, please find invoice {invoiceNumber} for {amount} attached. Due date: {dueDate}. Thank you, {businessName}.',
  email_quote_message:       'Hi {clientName}, please find your estimate {quoteNumber} attached for the amount of {amount}. This quote/estimate is valid until {expiryDate}. Thank you for your business! Kind regards, {businessName}',
  email_overdue_message:     'Hi {clientName}, this is a friendly reminder that invoice {invoiceNumber} for {amount} was due on {dueDate} and is now overdue. Please arrange payment at your earliest convenience. Kind regards, {businessName}',
  payment_terms_days:        7,
  discounts_enabled:         false,
  discount_type:             'percent',
}

const SUPABASE_COL = {
  name:                     'name',
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
  email_provider:           'email_provider',
  smtp_host:                'smtp_host',
  smtp_port:                'smtp_port',
  smtp_user:                'smtp_user',
  smtp_password:            'smtp_password',
  smtp_from_name:           'smtp_from_name',
  whatsapp_default_message:  'whatsapp_default_message',
  whatsapp_estimate_message: 'whatsapp_estimate_message',
  email_invoice_message:     'email_invoice_message',
  email_quote_message:       'email_quote_message',
  email_overdue_message:     'email_overdue_message',
  payment_terms_days:        'payment_terms_days',
  discounts_enabled:         'discounts_enabled',
  discount_type:             'discount_type',
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

// `profiles.banking_details` stores a JSON object: { bank_name, account_number, branch_code }.
// Older accounts may still have a free-text string saved — fall back to using
// it as the bank name so the data isn't silently dropped.
function parseBankingDetails(raw) {
  const empty = { bank_name: '', account_number: '', branch_code: '' }
  if (!raw) return empty
  try {
    const p = JSON.parse(raw)
    if (p && typeof p === 'object') {
      return {
        bank_name:      p.bank_name      ?? '',
        account_number: p.account_number ?? '',
        branch_code:    p.branch_code    ?? '',
      }
    }
  } catch (_) {
    // Legacy free-text banking details
    return { ...empty, bank_name: raw }
  }
  return empty
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

// ─── Section card — desktop static card / mobile accordion ───────────────────

function Section({ id, icon, title, badge, description, children, isOpen, onToggle, isMobile }) {
  if (!isMobile) {
    // Desktop: original static card layout (unchanged)
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

  // Mobile: collapsible accordion card
  return (
    <div style={{
      background:     '#fff',
      borderRadius:   10,
      marginBottom:   10,
      border:         '1px solid #e2e8f0',
      borderLeft:     `3px solid ${isOpen ? 'var(--primary, #14b8a6)' : 'transparent'}`,
      boxShadow:      isOpen ? '0 2px 10px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
      overflow:       'hidden',
      transition:     'box-shadow 0.2s',
    }}>
      {/* Accordion header — always visible */}
      <div
        onClick={onToggle}
        style={{
          padding:        '14px 16px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          cursor:         'pointer',
          userSelect:     'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{title}</span>
          {badge && (
            <span style={{
              background:    '#fef3c7', color: '#92400e',
              fontSize:      10, fontWeight: 700,
              padding:       '2px 8px', borderRadius: 999,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              border:        '1px solid #fde68a',
            }}>
              {badge}
            </span>
          )}
        </div>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke={isOpen ? 'var(--primary, #14b8a6)' : '#94a3b8'}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Accordion body — only when open */}
      {isOpen && (
        <div style={{ padding: '4px 16px 20px', borderTop: '1px solid #f1f5f9' }}>
          {children}
        </div>
      )}
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

// ─── Placeholder textarea ────────────────────────────────────────────────────

function PlaceholderTextarea({ value, onChange, placeholder, placeholders, inpStyle, onFocus, onBlur }) {
  const ref = useRef(null)

  function insert(tag) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? value.length
    const end   = el.selectionEnd   ?? value.length
    const next  = value.slice(0, start) + tag + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + tag.length
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {placeholders.map(({ label, tag }) => (
          <button key={tag} type="button" onClick={() => insert(tag)}
            style={{ padding: '4px 11px', borderRadius: 20, border: '1.5px solid #14b8a6', background: '#f0fdfa', color: '#0d9488', fontSize: 12, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4 }}>
            {label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        style={{ ...inpStyle, minHeight: 110, resize: 'vertical', fontFamily: 'inherit' }}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  )
}

// ─── Color picker ─────────────────────────────────────────────────────────────

function ColorPicker({ label, value, onChange, onBlur }) {
  const isMobile = useIsMobile()
  const swatchSize = isMobile ? 48 : 44

  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Swatch — clicking it opens the native color picker */}
        <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
          <div style={{
            width:        swatchSize,
            height:       swatchSize,
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
          fontSize:   isMobile ? 16 : 14,
          fontFamily: 'ui-monospace, Consolas, monospace',
          color:      '#334155',
          display:    'flex',
          alignItems: 'center',
          gap:        8,
          cursor:     'default',
          padding:    isMobile ? '12px' : '9px 12px',
          minHeight:  isMobile ? 48 : undefined,
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
    return `R ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec}`
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
      <div style={{
        padding: '7px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
        fontSize: 11, color: '#64748b', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Live Preview — Invoice Layout
      </div>

      <div style={{ background: '#fff', padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1, maxWidth: 220 }}>
            {form.logo_path ? (
              <img src={form.logo_path} alt="logo" style={{ width: 48, height: 48, objectFit: 'contain', display: 'block', marginBottom: 8, borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 3 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 6, background: primary + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, fontSize: 18, color: primary, fontWeight: 800 }}>
                {(form.business_name || 'B').charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{form.business_name || 'Your Business'}</div>
            {form.business_address && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, whiteSpace: 'pre-line', lineHeight: 1.4 }}>{form.business_address}</div>}
            {form.email && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{form.email}</div>}
            {form.phone && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{form.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: primary, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 8 }}>INVOICE</div>
            {[['Invoice #', `${prefix}${numStr}`], ['Issue Date', new Date().toISOString().slice(0, 10)], ['Due Date', new Date(Date.now() + 7*86400000).toISOString().slice(0, 10)]].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 3, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', minWidth: 90, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 2, background: primary, marginBottom: 14, borderRadius: 1 }} />
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Bill To</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Client Name</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>client@example.com</div>
        </div>
        <div style={{ borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 90px 90px', background: primary, padding: '6px 10px', gap: 8 }}>
            {['Item Description', 'Qty', 'Rate', 'Amount'].map((h, i) => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
            ))}
          </div>
          {sampleItems.map((item, i) => (
            <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 90px 90px', padding: '7px 10px', gap: 8, alignItems: 'start', background: i % 2 === 1 ? '#f8fafc' : '#fff', borderBottom: '1px solid #f1f5f9' }}>
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
  const { user, signOut, currentProfile, refreshSubscription } = useAuth()
  const { profile, refreshProfile } = useAppData()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()

  const savedSmtp = useRef({ host: '', port: '' })

  const [form, setForm]                   = useState(DEFAULTS)
  const [originalForm, setOriginalForm]   = useState(DEFAULTS)
  const [pendingNav, setPendingNav]       = useState(null)
  const [toastVisible, setToast]          = useState(false)
  const [saveError, setSaveError]         = useState('')
  const [saving, setSaving]               = useState(false)
  const [payMethods, setPayMethods]       = useState(BUILTIN_METHODS)
  const [newMethod, setNewMethod]         = useState('')
  const [expCategories, setExpCategories] = useState(BUILTIN_CATEGORIES)
  const [newCategory, setNewCategory]     = useState('')
  const [addingCategory, setAddingCategory]     = useState(false)
  const [editingCategory, setEditingCategory]   = useState(null)
  const [editCategoryValue, setEditCategoryValue] = useState('')
  const [testEmailStatus, setTestEmailStatus] = useState(null)
  const [testEmailMsg, setTestEmailMsg]   = useState('')
  const [showSubPlans,  setShowSubPlans]  = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling,    setCancelling]    = useState(false)
  const toastTimer  = useRef(null)
  const logoRef     = useRef(null)

  // ── Gmail OAuth connection state ─────────────────────────────────────────
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail,     setGmailEmail]     = useState('')
  const [gmailLoading,   setGmailLoading]   = useState(false)
  const [gmailToast,     setGmailToast]     = useState(null) // { message, type }
  const gmailToastTimer = useRef(null)

  // Mobile accordion — which section is currently open
  const [openSection, setOpenSection] = useState('business')
  function toggleSection(id) {
    setOpenSection(prev => prev === id ? null : id)
  }

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

      const merged = {
        ...DEFAULTS,
        name:                     profile.name                     ?? DEFAULTS.name,
        business_name:            profile.business_name            ?? DEFAULTS.business_name,
        business_address:         profile.address                  ?? DEFAULTS.business_address,
        email:                    profile.email                    ?? DEFAULTS.email,
        phone:                    profile.phone                    ?? DEFAULTS.phone,
        vat_number:               profile.vat_number               ?? DEFAULTS.vat_number,
        logo_path:                profile.logo_url                 ?? DEFAULTS.logo_path,
        primary_color:            profile.primary_color            ?? DEFAULTS.primary_color,
        accent_color:             profile.accent_color             ?? DEFAULTS.accent_color,
        text_color:               profile.text_color               ?? DEFAULTS.text_color,
        invoice_prefix:           profile.invoice_prefix           ?? DEFAULTS.invoice_prefix,
        estimate_prefix:          profile.estimate_prefix          ?? DEFAULTS.estimate_prefix,
        starting_invoice_number:  profile.starting_invoice_number  ?? DEFAULTS.starting_invoice_number,
        starting_estimate_number: profile.starting_estimate_number ?? DEFAULTS.starting_estimate_number,
        default_payment_terms:    profile.default_payment_terms    ?? DEFAULTS.default_payment_terms,
        default_payment_method:   profile.default_payment_method   ?? DEFAULTS.default_payment_method,
        terms_conditions:         profile.terms                    ?? DEFAULTS.terms_conditions,
        ...parseBankingDetails(profile.banking_details),
        email_provider:           profile.email_provider           ?? DEFAULTS.email_provider,
        smtp_host:                profile.smtp_host                ?? DEFAULTS.smtp_host,
        smtp_port:                profile.smtp_port                ?? DEFAULTS.smtp_port,
        smtp_user:                profile.smtp_user                ?? DEFAULTS.smtp_user,
        smtp_password:            profile.smtp_password            ?? DEFAULTS.smtp_password,
        smtp_from_name:           profile.smtp_from_name           ?? DEFAULTS.smtp_from_name,
        whatsapp_default_message:  profile.whatsapp_default_message  || DEFAULTS.whatsapp_default_message,
        whatsapp_estimate_message: profile.whatsapp_estimate_message || DEFAULTS.whatsapp_estimate_message,
        // Fall back to the (previously mis-wired) whatsapp_* column so anyone
        // who already customised the "Invoice/Quote Default Message" box
        // before this fix keeps seeing their own text, not the hardcoded default.
        email_invoice_message:     profile.email_invoice_message     || profile.whatsapp_default_message  || DEFAULTS.email_invoice_message,
        email_quote_message:       profile.email_quote_message       || profile.whatsapp_estimate_message || DEFAULTS.email_quote_message,
        email_overdue_message:     profile.email_overdue_message     || DEFAULTS.email_overdue_message,
        payment_terms_days:        profile.payment_terms_days        ?? DEFAULTS.payment_terms_days,
        discounts_enabled:         profile.discounts_enabled         ?? DEFAULTS.discounts_enabled,
        discount_type:             profile.discount_type             ?? DEFAULTS.discount_type,
      }
      setForm(merged)
      // Snapshot the freshly-loaded values as the "original" baseline for
      // unsaved-changes comparison.
      setOriginalForm(merged)
      setPayMethods(parseMethods(profile.payment_methods))
      setExpCategories(parseCategories(profile.expense_categories))

      setGmailConnected(profile.email_provider === 'gmail' && !!profile.gmail_connected_email)
      setGmailEmail(profile.gmail_connected_email ?? '')
    }
    load()
  }, [user])

  // ── Unsaved-changes detection ────────────────────────────────────────────
  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm)

  // Warn before closing/refreshing the tab/app with unsaved changes
  useEffect(() => {
    if (!hasChanges) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  // Intercept in-app navigation (sidebar / bottom nav links) while there are
  // unsaved changes and show a confirmation modal instead.
  useEffect(() => {
    if (!hasChanges) return
    const handler = (e) => {
      const link = e.target.closest?.('a[href]')
      if (!link) return
      const href = link.getAttribute('href') || ''
      if (!href.startsWith('#/')) return
      const path = href.slice(1)
      if (path === location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      setPendingNav(path)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [hasChanges, location.pathname])

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback(() => {
    setToast(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(false), 2200)
  }, [])

  // ── Gmail toast helper (supports a custom message, unlike the "Saved" toast above) ──
  const showGmailToast = useCallback((message, type = 'success') => {
    setGmailToast({ message, type })
    clearTimeout(gmailToastTimer.current)
    gmailToastTimer.current = setTimeout(() => setGmailToast(null), 4000)
  }, [])

  // ── Gmail OAuth callback handling ────────────────────────────────────────
  // After the user grants (or denies) access, Google redirects back to
  // /api/gmail-callback.js, which in turn redirects here as
  // /settings?gmail=connected or /settings?gmail=error.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const gmailResult = params.get('gmail')
    if (!gmailResult || !user) return

    async function handleGmailRedirect() {
      if (gmailResult === 'connected') {
        const { data: rows, error } = await supabase
          .from('profiles')
          .select('email_provider, gmail_connected_email')
          .eq('id', user.id)
          .limit(1)

        const profile = error ? null : rows?.[0] ?? null
        const connectedEmail = profile?.gmail_connected_email ?? ''
        const connected = profile?.email_provider === 'gmail' && !!connectedEmail

        setGmailConnected(connected)
        setGmailEmail(connectedEmail)
        setForm(prev => ({ ...prev, email_provider: connected ? 'gmail' : prev.email_provider }))
        setOriginalForm(prev => ({ ...prev, email_provider: connected ? 'gmail' : prev.email_provider }))
        // Sync the app-wide profile cache so other pages (Invoices, Estimates,
        // SendEmailModal) see the new provider/tokens immediately.
        await refreshProfile()

        showGmailToast(
          connected
            ? `Gmail connected successfully! You can now send invoices from ${connectedEmail}`
            : 'Gmail connected, but the connected address could not be confirmed.',
          connected ? 'success' : 'error'
        )
      } else if (gmailResult === 'error') {
        showGmailToast('Failed to connect Gmail. Please try again.', 'error')
      }

      // Clean the URL so refreshing doesn't re-trigger this handling.
      const hashPath = window.location.hash.split('?')[0]
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${hashPath}`)
    }

    handleGmailRedirect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, user])

  // ── Gmail connect / disconnect ───────────────────────────────────────────
  const handleConnectGmail = useCallback(async () => {
    setGmailLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      setGmailLoading(false)
      showGmailToast('Failed to connect Gmail. Please try again.', 'error')
      return
    }
    // Full-page redirect — the OAuth round trip leaves and re-enters the app.
    window.location.href = `/api/gmail-auth?user_id=${authUser.id}`
  }, [showGmailToast])

  const handleDisconnectGmail = useCallback(async () => {
    if (!window.confirm('Disconnect Gmail? Your email provider will switch back to SMTP.')) return
    if (!user) return

    setGmailLoading(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        gmail_access_token:    null,
        gmail_refresh_token:   null,
        gmail_token_expiry:    null,
        gmail_connected_email: null,
        email_provider:        'smtp',
      })
      .eq('id', user.id)

    if (error) {
      setGmailLoading(false)
      showGmailToast('Failed to disconnect Gmail. Please try again.', 'error')
      return
    }

    setGmailConnected(false)
    setGmailEmail('')
    setGmailLoading(false)
    setForm(prev => ({ ...prev, email_provider: 'smtp' }))
    setOriginalForm(prev => ({ ...prev, email_provider: 'smtp' }))
    await refreshProfile()
    showGmailToast('Gmail disconnected', 'success')
  }, [user, refreshProfile, showGmailToast])

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleChange = (field) => (e) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleColor = (field) => (value) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleEmailProvider = (provider) => () =>
    setForm(prev => {
      if (provider === 'gmail') {
        // Save current custom SMTP values before overwriting
        savedSmtp.current = { host: prev.smtp_host, port: prev.smtp_port }
        return { ...prev, email_provider: 'gmail', smtp_host: 'smtp.gmail.com', smtp_port: '587' }
      }
      // Restore the values that were set before Gmail was selected
      return {
        ...prev,
        email_provider: 'smtp',
        smtp_host: savedSmtp.current.host,
        smtp_port: savedSmtp.current.port,
      }
    })

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
          profileData[col] = (v === '' || v === null || v === undefined) ? null : v
        }
        profileData.payment_methods    = JSON.stringify(payMethods)
        profileData.expense_categories = JSON.stringify(expCategories)
        profileData.banking_details    = JSON.stringify({
          bank_name:      form.bank_name      || '',
          account_number: form.account_number || '',
          branch_code:    form.branch_code    || '',
        })
        if (profileData.payment_terms_days != null) profileData.payment_terms_days = parseInt(profileData.payment_terms_days, 10) || 7

        const { error: profileError } = await supabase.from('profiles').upsert(profileData, { onConflict: 'id' })
        if (profileError) throw new Error(profileError.message)

        refreshProfile()
        // Reset the unsaved-changes baseline now that the form matches the DB
        setOriginalForm(form)
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
    const isGmailProvider = form.email_provider === 'gmail'
    const smtp = {
      host:      form.smtp_host     || '',
      port:      form.smtp_port     || '587',
      user:      form.smtp_user     || '',
      password:  form.smtp_password || '',
      from_name: form.smtp_from_name || form.business_name || '',
    }

    if (isGmailProvider && !profile?.gmail_access_token) {
      setTestEmailMsg('Gmail not connected. Please reconnect Gmail in Settings.')
      setTestEmailStatus('error')
      return
    }
    if (!isGmailProvider && (!smtp.host || !smtp.user || !smtp.password)) {
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

    const to = isGmailProvider ? gmailEmail : smtp.user

    try {
      await sendEmail({
        supabase,
        userId:  user?.id,
        profile: { ...profile, ...form },
        to,
        subject: 'FundiBill — Test Email',
        html,
        pdfBase64:   null,
        pdfFilename: null,
      })
      setTestEmailStatus('success')
      setTestEmailMsg(isGmailProvider ? 'Test email sent! Check your inbox.' : `Test email sent to ${to}`)
    } catch (e) {
      setTestEmailStatus('error')
      setTestEmailMsg(e.message || 'Failed to send. Check your email settings.')
    }
  }

  // ── Shared focus style ────────────────────────────────────────────────────
  const focusStyle = (e) => { e.currentTarget.style.borderColor = '#14b8a6' }
  const blurStyle  = (e) => { e.currentTarget.style.borderColor = '#e2e8f0' }

  // ── Subscription helpers ───────────────────────────────────────────────────

  async function handleCancelSubscription() {
    setCancelling(true)
    try {
      const { error } = await supabase.functions.invoke('cancel-subscription', { body: {} })
      if (error) throw error
      await refreshSubscription()
      setCancelConfirm(false)
      showToast('Subscription cancelled.')
    } catch (err) {
      console.error('Cancel subscription error', err)
      alert('Could not cancel subscription. Please try again or contact support.')
    } finally {
      setCancelling(false)
    }
  }

  function handleSubSelectPlan(plan) {
    const params = new URLSearchParams({
      plan,
      user_id: user?.id    || '',
      email:   user?.email || '',
      name:    form.business_name || '',
    })
    window.db?.openExternal(`https://api.fundibill.online/fundibill-buy.php?${params.toString()}`)
    setShowSubPlans(false)
  }

  // ── Mobile-aware input style (fontSize:16 prevents iOS zoom; 44px touch target)
  const inp = isMobile
    ? { ...INPUT, fontSize: 16, minHeight: 44, padding: '10px 12px' }
    : INPUT

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      padding:    isMobile ? '16px 16px 96px' : '32px 32px 64px',
      maxWidth:   820,
      overflowY:  'auto',
      height:     '100%',
      boxSizing:  'border-box',
    }}>
      <style>{`@keyframes testEmailSpin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Page header — hidden on mobile (MobileHeader shows "Settings") ── */}
      {!isMobile && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>Settings</h1>
              {hasChanges && (
                <span
                  title="You have unsaved changes"
                  aria-label="Unsaved changes"
                  style={{
                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                    background: form.primary_color || '#14b8a6',
                    boxShadow: `0 0 0 3px ${(form.primary_color || '#14b8a6')}22`,
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {hasChanges && (
                <button
                  onClick={isReadOnly ? undefined : handleSave}
                  disabled={saving || isReadOnly}
                  title={isReadOnly ? 'Your trial has ended. Upgrade to continue.' : undefined}
                  style={{
                    background:   isReadOnly ? '#94a3b8' : (form.primary_color || '#14b8a6'),
                    color:        '#fff',
                    border:       'none',
                    borderRadius: 8,
                    padding:      '9px 20px',
                    fontSize:     13,
                    fontWeight:   600,
                    cursor:       isReadOnly ? 'not-allowed' : saving ? 'wait' : 'pointer',
                    opacity:      isReadOnly ? 0.55 : saving ? 0.75 : 1,
                    boxShadow:    (saving || isReadOnly) ? 'none' : `0 2px 8px ${(form.primary_color || '#14b8a6')}4d`,
                    transition:   'opacity 0.15s',
                    whiteSpace:   'nowrap',
                  }}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
              <HelpButton page="settings" />
            </div>
          </div>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: saveError ? 16 : 28 }}>
            Manage your business profile, branding, and document preferences.
          </p>
        </>
      )}

      {/* Mobile: compact header with help button */}
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <HelpButton page="settings" />
        </div>
      )}

      {/* ── MOBILE: Save button fixed to top-right of the mobile header bar ── */}
      {isMobile && hasChanges && (
        <div style={{
          position: 'fixed',
          top:      11,
          right:    56,
          zIndex:   40,
        }}>
          <button
            onClick={isReadOnly ? undefined : handleSave}
            disabled={saving || isReadOnly}
            title={isReadOnly ? 'Your trial has ended. Upgrade to continue.' : undefined}
            style={{
              height:       34,
              padding:      '0 14px',
              border:       'none',
              borderRadius: 8,
              background:   isReadOnly ? '#94a3b8' : (form.primary_color || 'var(--primary, #14b8a6)'),
              color:        '#fff',
              fontWeight:   700,
              fontSize:     13,
              cursor:       isReadOnly ? 'not-allowed' : saving ? 'wait' : 'pointer',
              opacity:      isReadOnly ? 0.6 : saving ? 0.8 : 1,
              boxShadow:    '0 2px 8px rgba(0,0,0,0.25)',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          6,
              fontFamily:   'inherit',
              whiteSpace:   'nowrap',
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#fff', flexShrink: 0,
            }} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {saveError && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '10px 14px', marginBottom: isMobile ? 12 : 24, fontSize: 13, color: '#dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>⚠ {saveError}</span>
          <button onClick={() => setSaveError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* ── BUSINESS PROFILE ─────────────────────────────────────────────── */}
      <Section
        id="business" icon="🏢"
        title={isMobile ? 'Business Details' : 'Business Profile'}
        description="Appears on all invoices and estimates"
        isOpen={openSection === 'business'}
        onToggle={() => toggleSection('business')}
        isMobile={isMobile}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 16 }}>

          <Field label="Your Name">
            <input
              style={inp} value={form.name} placeholder="e.g. Dewald"
              onChange={handleChange('name')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          <Field label="Business Name">
            <input
              style={inp} value={form.business_name} placeholder="Acme Studio"
              onChange={handleChange('business_name')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          <Field label="Email Address">
            <input
              style={inp} value={form.email} type="email" placeholder="billing@yourbusiness.com"
              onChange={handleChange('email')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          <Field label="Business Address" style={{ gridColumn: isMobile ? undefined : '1 / -1' }}>
            <textarea
              style={{ ...inp, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
              value={form.business_address}
              placeholder={'123 Main Street\nCape Town, 8001\nSouth Africa'}
              onChange={handleChange('business_address')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          <Field label="Contact Number">
            <input
              style={inp} value={form.phone} placeholder="+27 21 000 0000"
              onChange={handleChange('phone')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          <Field label="VAT Number" hint="optional">
            <input
              style={inp} value={form.vat_number} placeholder="4010000000"
              onChange={handleChange('vat_number')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          {/* Logo upload */}
          <Field label="Business Logo" hint="PNG or JPG, square recommended" style={{ gridColumn: isMobile ? undefined : '1 / -1' }}>
            <div
              onClick={() => logoRef.current?.click()}
              style={{
                border:      '2px dashed #e2e8f0',
                borderRadius: 10,
                padding:     isMobile ? '20px 16px' : '16px 20px',
                cursor:      'pointer',
                display:     'flex',
                alignItems:  'center',
                gap:         16,
                background:  '#f8fafc',
                transition:  'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#14b8a6'; e.currentTarget.style.background = '#f0fdfa' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
            >
              {form.logo_path ? (
                <>
                  <img
                    src={form.logo_path}
                    alt="Business logo"
                    style={{ height: isMobile ? 80 : 52, maxWidth: 160, objectFit: 'contain', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', padding: 4 }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Logo uploaded</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Tap to replace</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 52, height: 52, borderRadius: 10, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Upload your logo</div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Tap to select a PNG or JPG file</div>
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
                  padding:      isMobile ? '10px 16px' : '4px 12px',
                  fontSize:     isMobile ? 14 : 12,
                  fontWeight:   500,
                  cursor:       'pointer',
                  width:        isMobile ? '100%' : undefined,
                }}
              >
                Remove logo
              </button>
            )}

            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: 'none' }} onChange={handleLogoChange} />
          </Field>
        </div>
      </Section>

      {/* ── APPEARANCE ───────────────────────────────────────────────────── */}
      <Section
        id="appearance" icon="🎨"
        title="Appearance"
        description="Controls the colour scheme of your generated documents"
        isOpen={openSection === 'appearance'}
        onToggle={() => toggleSection('appearance')}
        isMobile={isMobile}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 16 }}>
          <ColorPicker
            label={isMobile ? 'App Theme Color' : 'Primary Color'}
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
      <Section
        id="documents" icon="📄"
        title={isMobile ? 'Invoice Settings' : 'Document Settings'}
        description="Numbering, prefixes, and default terms"
        isOpen={openSection === 'documents'}
        onToggle={() => toggleSection('documents')}
        isMobile={isMobile}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 16 }}>

          <Field label="Invoice Prefix">
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                style={{ ...inp, borderRadius: '8px 0 0 8px', flex: 1 }}
                value={form.invoice_prefix}
                placeholder="INV-"
                onChange={handleChange('invoice_prefix')}
                onBlur={blurStyle} onFocus={focusStyle}
              />
              <div style={{
                background:   '#f1f5f9', border: '1.5px solid #e2e8f0', borderLeft: 'none',
                borderRadius: '0 8px 8px 0', padding: isMobile ? '10px 12px' : '9px 12px',
                fontSize: 13, color: '#64748b',
                fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'nowrap',
                minHeight: isMobile ? 44 : undefined, display: 'flex', alignItems: 'center',
              }}>
                {(form.invoice_prefix || 'INV-')}{String(form.starting_invoice_number || 1).padStart(4, '0')}
              </div>
            </div>
          </Field>

          <Field label="Quote Prefix">
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                style={{ ...inp, borderRadius: '8px 0 0 8px', flex: 1 }}
                value={form.estimate_prefix}
                placeholder="QT-"
                onChange={handleChange('estimate_prefix')}
                onBlur={blurStyle} onFocus={focusStyle}
              />
              <div style={{
                background:   '#f1f5f9', border: '1.5px solid #e2e8f0', borderLeft: 'none',
                borderRadius: '0 8px 8px 0', padding: isMobile ? '10px 12px' : '9px 12px',
                fontSize: 13, color: '#64748b',
                fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'nowrap',
                minHeight: isMobile ? 44 : undefined, display: 'flex', alignItems: 'center',
              }}>
                {(form.estimate_prefix || 'QT-')}{String(form.starting_estimate_number || 1).padStart(4, '0')}
              </div>
            </div>
          </Field>

          <Field label="Starting Invoice Number">
            <input
              style={inp} type="number" min={1}
              value={form.starting_invoice_number}
              onChange={handleChange('starting_invoice_number')}
              onBlur={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setForm(p => ({ ...p, starting_invoice_number: v })); blurStyle(e) }}
              onFocus={focusStyle}
            />
          </Field>

          <Field label="Starting Estimate Number">
            <input
              style={inp} type="number" min={1}
              value={form.starting_estimate_number}
              onChange={handleChange('starting_estimate_number')}
              onBlur={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setForm(p => ({ ...p, starting_estimate_number: v })); blurStyle(e) }}
              onFocus={focusStyle}
            />
          </Field>

          {/* Discount */}
          <div style={{ gridColumn: isMobile ? undefined : '1 / -1', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={!!form.discounts_enabled}
                onChange={e => setForm(p => ({ ...p, discounts_enabled: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: form.primary_color || '#14b8a6', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Enable discounts on invoices and quotes</span>
            </label>
            {form.discounts_enabled && (
              <div style={{ marginLeft: 26, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { id: 'percent', label: '% Percentage discount' },
                  { id: 'fixed',   label: 'R Fixed amount discount' },
                ].map(opt => (
                  <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: form.discount_type === opt.id ? '#0f172a' : '#64748b' }}>
                    <input
                      type="radio"
                      name="discount_type"
                      value={opt.id}
                      checked={form.discount_type === opt.id}
                      onChange={() => setForm(p => ({ ...p, discount_type: opt.id }))}
                      style={{ accentColor: form.primary_color || '#14b8a6' }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
          </div>

        </div>
      </Section>

      {/* ── BANKING DETAILS ──────────────────────────────────────────────── */}
      <Section
        id="banking" icon="💳"
        title="Banking Details"
        description="Displayed on invoices to help clients make payment"
        isOpen={openSection === 'banking'}
        onToggle={() => toggleSection('banking')}
        isMobile={isMobile}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 16 }}>

          <Field label="Bank Name">
            <input
              style={inp} value={form.bank_name} placeholder="e.g. Capitec Bank"
              onChange={handleChange('bank_name')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          <Field label="Account Number">
            <input
              style={inp} value={form.account_number} placeholder="e.g. 1234567890"
              onChange={handleChange('account_number')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

          <Field label="Branch Code">
            <input
              style={inp} value={form.branch_code} placeholder="e.g. 470010"
              onChange={handleChange('branch_code')}
              onBlur={blurStyle} onFocus={focusStyle}
            />
          </Field>

        </div>
      </Section>

      {/* ── NOTIFICATIONS & MESSAGES ─────────────────────────────────────── */}
      <Section
        id="whatsapp" icon="💬"
        title="Notifications & Messages"
        description="Default message templates for emails and WhatsApp sharing"
        isOpen={openSection === 'whatsapp'}
        onToggle={() => toggleSection('whatsapp')}
        isMobile={isMobile}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
            These templates pre-fill the message body when sharing via email or WhatsApp. Click a tag to insert it at your cursor.
          </p>

          {/* Invoice message */}
          <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Invoice Default Message</p>
            <PlaceholderTextarea
              value={form.email_invoice_message}
              onChange={v => setForm(p => ({ ...p, email_invoice_message: v, whatsapp_default_message: v }))}
              placeholder={`Hi {clientName}, please find invoice {invoiceNumber} for {amount} attached. Due date: {dueDate}. Thank you, {businessName}.`}
              inpStyle={inp}
              onFocus={focusStyle}
              onBlur={blurStyle}
              placeholders={[
                { label: 'Client Name',    tag: '{clientName}' },
                { label: 'Invoice #',      tag: '{invoiceNumber}' },
                { label: 'Amount',         tag: '{amount}' },
                { label: 'Due Date',       tag: '{dueDate}' },
                { label: 'Business Name',  tag: '{businessName}' },
              ]}
            />
          </div>

          {/* Quote message */}
          <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Quote Default Message</p>
            <PlaceholderTextarea
              value={form.email_quote_message}
              onChange={v => setForm(p => ({ ...p, email_quote_message: v, whatsapp_estimate_message: v }))}
              placeholder={`Hi {clientName}, please find your estimate {quoteNumber} attached for the amount of {amount}. This quote/estimate is valid until {expiryDate}. Thank you for your business! Kind regards, {businessName}`}
              inpStyle={inp}
              onFocus={focusStyle}
              onBlur={blurStyle}
              placeholders={[
                { label: 'Client Name',    tag: '{clientName}' },
                { label: 'Quote #',        tag: '{quoteNumber}' },
                { label: 'Amount',         tag: '{amount}' },
                { label: 'Expiry Date',    tag: '{expiryDate}' },
                { label: 'Business Name',  tag: '{businessName}' },
              ]}
            />
          </div>

          {/* Overdue reminder message */}
          <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Overdue Reminder Message</p>
            <PlaceholderTextarea
              value={form.email_overdue_message}
              onChange={v => setForm(p => ({ ...p, email_overdue_message: v }))}
              placeholder={`Hi {clientName}, this is a friendly reminder that invoice {invoiceNumber} for {amount} was due on {dueDate} and is now overdue. Please arrange payment at your earliest convenience. Kind regards, {businessName}`}
              inpStyle={inp}
              onFocus={focusStyle}
              onBlur={blurStyle}
              placeholders={[
                { label: 'Client Name',    tag: '{clientName}' },
                { label: 'Invoice #',      tag: '{invoiceNumber}' },
                { label: 'Amount',         tag: '{amount}' },
                { label: 'Due Date',       tag: '{dueDate}' },
                { label: 'Business Name',  tag: '{businessName}' },
              ]}
            />
          </div>
        </div>
      </Section>

      {/* ── EMAIL / SMTP ─────────────────────────────────────────────────── */}
      <Section
        id="email" icon="📧"
        title="Email Settings"
        description="SMTP configuration for sending invoices and quotes by email"
        isOpen={openSection === 'email'}
        onToggle={() => toggleSection('email')}
        isMobile={isMobile}
      >
        {/* Provider toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            {
              id: 'gmail', label: 'Google / Gmail',
              icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" opacity=".6"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".8"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity=".4"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>,
            },
            {
              id: 'smtp', label: 'Custom SMTP',
              icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>,
            },
          ].map(({ id, label, icon }) => {
            const active = form.email_provider === id
            return (
              <button
                key={id}
                onClick={handleEmailProvider(id)}
                style={{
                  flex: isMobile ? '1 1 auto' : undefined,
                  padding: isMobile ? '12px 18px' : '9px 18px',
                  minHeight: isMobile ? 44 : undefined,
                  borderRadius: 8,
                  border: active ? `1.5px solid ${form.primary_color || '#14b8a6'}` : '1.5px solid #e2e8f0',
                  background: active ? (form.primary_color || '#14b8a6') : '#fff',
                  color: active ? '#fff' : '#374151',
                  fontWeight: 600, fontSize: isMobile ? 14 : 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                {icon}{label}
              </button>
            )
          })}
        </div>

        {form.email_provider === 'gmail' ? (
          <>
            {gmailConnected ? (
              /* ── STATE B — Gmail connected ────────────────────────────── */
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '14px 16px',
                background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
                  marginTop: 5, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#166534', margin: 0 }}>
                    Connected: {gmailEmail}
                  </p>
                  <p style={{ fontSize: 12, color: '#4b7c5b', margin: '4px 0 8px', lineHeight: 1.5 }}>
                    Invoices and estimates will be sent from this Gmail address.
                  </p>
                  <button
                    onClick={handleDisconnectGmail}
                    disabled={gmailLoading}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: '#dc2626', fontSize: 13, fontWeight: 600,
                      textDecoration: 'underline', cursor: gmailLoading ? 'wait' : 'pointer',
                      opacity: gmailLoading ? 0.6 : 1,
                    }}
                  >
                    {gmailLoading ? 'Disconnecting…' : 'Disconnect'}
                  </button>

                  <div style={{ marginTop: 16, maxWidth: isMobile ? undefined : 360 }}>
                    <Field label="From Name" hint="shown as the sender">
                      <input
                        style={inp}
                        value={form.business_name} placeholder="Acme Studio"
                        onChange={handleChange('business_name')}
                        onBlur={blurStyle} onFocus={focusStyle}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            ) : (
              /* ── STATE A — Gmail not connected ────────────────────────── */
              <div>
                <button
                  onClick={handleConnectGmail}
                  disabled={gmailLoading}
                  style={{
                    background: '#fff', color: '#374151',
                    border: '1.5px solid #e2e8f0', borderRadius: 8,
                    padding: isMobile ? '12px 18px' : '9px 18px',
                    fontWeight: 600, fontSize: isMobile ? 14 : 13,
                    cursor: gmailLoading ? 'wait' : 'pointer',
                    opacity: gmailLoading ? 0.7 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    width: isMobile ? '100%' : undefined, justifyContent: 'center',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" opacity=".6"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".8"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity=".4"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  {gmailLoading ? 'Connecting…' : 'Connect Gmail'}
                </button>
                <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 0' }}>
                  Send invoices and estimates directly from your Gmail address
                </p>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 16 }}>

            <Field label="SMTP Host">
              <input
                style={inp} value={form.smtp_host} placeholder="smtp.gmail.com"
                onChange={handleChange('smtp_host')}
                onBlur={blurStyle} onFocus={focusStyle}
              />
            </Field>

            <Field label="SMTP Port">
              <input
                style={inp} value={form.smtp_port} placeholder="587"
                onChange={handleChange('smtp_port')}
                onBlur={blurStyle} onFocus={focusStyle}
              />
            </Field>

            <Field label="From Email" hint="also used as SMTP username">
              <input
                style={inp} value={form.smtp_user} placeholder="you@example.com" type="email"
                onChange={handleChange('smtp_user')}
                onBlur={blurStyle} onFocus={focusStyle}
              />
            </Field>

            <Field label="SMTP Password">
              <PasswordInput
                style={inp} value={form.smtp_password} placeholder="••••••••"
                onChange={handleChange('smtp_password')}
                onBlur={blurStyle} onFocus={focusStyle}
              />
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 5, lineHeight: 1.5 }}>
                Using Gmail? Switch to the <strong style={{ color: '#64748b' }}>Google / Gmail</strong> tab above and use an App Password.
              </p>
            </Field>

            <Field label="From Name" hint="shown as the sender" style={{ gridColumn: isMobile ? undefined : '1 / -1' }}>
              <input
                style={{ ...inp, maxWidth: isMobile ? undefined : 360 }}
                value={form.smtp_from_name} placeholder="Acme Studio"
                onChange={handleChange('smtp_from_name')}
                onBlur={blurStyle} onFocus={focusStyle}
              />
            </Field>
          </div>
        )}

        {/* Test Email */}
        {(form.email_provider === 'smtp' || (form.email_provider === 'gmail' && gmailConnected)) && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={sendTestEmail}
            disabled={testEmailStatus === 'sending'}
            style={{
              width:      isMobile ? '100%' : undefined,
              padding:    isMobile ? '12px 18px' : '9px 18px',
              minHeight:  isMobile ? 44 : undefined,
              borderRadius: 8, border: '1.5px solid #14b8a6',
              background: testEmailStatus === 'sending' ? '#f0fdfa' : '#fff',
              color: '#14b8a6', fontWeight: 600, fontSize: isMobile ? 15 : 13,
              cursor: testEmailStatus === 'sending' ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'background 0.15s',
            }}
          >
            {testEmailStatus === 'sending' ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'testEmailSpin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Sending…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Send Test Email
              </>
            )}
          </button>
          {testEmailStatus === 'success' && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {testEmailMsg}
            </div>
          )}
          {testEmailStatus === 'error' && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626', fontWeight: 500 }}>⚠ {testEmailMsg}</div>
          )}
        </div>
        )}

      </Section>

      {/* ── PAYMENT & REMINDERS ─────────────────────────────────────────── */}
      <Section
        id="payment" icon="⏰"
        title="Payment & Reminders"
        description="Default payment terms and reminder bell settings"
        isOpen={openSection === 'payment'}
        onToggle={() => toggleSection('payment')}
        isMobile={isMobile}
      >
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Default payment terms (days)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={1} max={365}
              style={{ ...inp, width: isMobile ? 120 : 100 }}
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
            Invoices overdue by more than {form.payment_terms_days || 7} days will show a reminder bell icon.
          </p>
        </div>
      </Section>

      {/* ── TERMS & CONDITIONS ───────────────────────────────────────────── */}
      <Section
        id="terms" icon="📝"
        title="Terms & Conditions"
        description="Printed at the bottom of every invoice and estimate"
        isOpen={openSection === 'terms'}
        onToggle={() => toggleSection('terms')}
        isMobile={isMobile}
      >
        <textarea
          style={{ ...inp, minHeight: 140, resize: 'vertical', lineHeight: 1.6 }}
          value={form.terms_conditions}
          placeholder="e.g. Payment is due within the specified period. Late payments may incur a fee of 2% per month..."
          onChange={handleChange('terms_conditions')}
          onBlur={blurStyle} onFocus={focusStyle}
        />
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
          Supports plain text. Keep it concise — it will appear in the footer of each document.
        </p>
      </Section>

      {isReadOnly && (
        <div style={{ marginBottom: 28, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
          Settings are locked. Upgrade to make changes.
        </div>
      )}

      {/* ── PAYMENT METHODS ──────────────────────────────────────────────── */}
      <Section
        id="methods" icon="💰"
        title="Payment Methods"
        description="Payment options shown when marking invoices as paid"
        isOpen={openSection === 'methods'}
        onToggle={() => toggleSection('methods')}
        isMobile={isMobile}
      >
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
          Configure the payment methods your clients can use.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {payMethods.map((method) => (
            <div key={method} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8,
              padding: isMobile ? '12px 14px' : '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="radio"
                  name="defaultPayMethod"
                  checked={form.default_payment_method === method}
                  onChange={async () => {
                    setForm(p => ({ ...p, default_payment_method: method }))
                    setOriginalForm(p => ({ ...p, default_payment_method: method }))
                    await supabase.from('profiles').update({ default_payment_method: method }).eq('id', user.id)
                    showToast()
                  }}
                  style={{ accentColor: '#14b8a6', width: 16, height: 16 }}
                />
                <span style={{ fontSize: isMobile ? 15 : 14, color: '#0f172a', fontWeight: 500 }}>{method}</span>
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
                    setOriginalForm(p => ({ ...p, payment_methods: JSON.stringify(updated), default_payment_method: newDefault }))
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
              setOriginalForm(p => ({ ...p, payment_methods: JSON.stringify(updated), default_payment_method: defaultM }))
              await supabase.from('profiles').update({ payment_methods: JSON.stringify(updated), default_payment_method: defaultM }).eq('id', user.id)
              showToast()
            }}
            placeholder="Type a payment method and press Enter…"
            style={{ ...inp, flex: 1 }}
            onFocus={focusStyle} onBlur={blurStyle}
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
              setOriginalForm(p => ({ ...p, payment_methods: JSON.stringify(updated), default_payment_method: defaultM }))
              await supabase.from('profiles').update({ payment_methods: JSON.stringify(updated), default_payment_method: defaultM }).eq('id', user.id)
              showToast()
            }}
            style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: isMobile ? '12px 16px' : '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(20,184,166,0.3)' }}>
            Add
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          Select the radio button next to a method to set it as the default.
        </p>
      </Section>

      {/* ── EXPENSE CATEGORIES ───────────────────────────────────────────── */}
      <Section
        id="categories" icon="📊"
        title="Expense Categories"
        description="Categories shown when recording expenses"
        isOpen={openSection === 'categories'}
        onToggle={() => toggleSection('categories')}
        isMobile={isMobile}
      >
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
          Add your expense categories below. These will appear as options when recording expenses.
          Click + to add a new category, or click an existing one to edit or delete it.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {expCategories.map((cat) => {
            const isEditing = editingCategory === cat

            const commitEdit = async () => {
              const newName = editCategoryValue.trim()
              setEditingCategory(null)
              if (!newName || newName === cat || expCategories.includes(newName)) {
                setEditCategoryValue('')
                return
              }
              const updated = expCategories.map(c => c === cat ? newName : c)
              setExpCategories(updated)
              setEditCategoryValue('')
              await supabase.from('profiles').update({ expense_categories: JSON.stringify(updated) }).eq('id', user.id)
              showToast()
            }

            return (
              <div key={cat} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8,
                padding: isMobile ? '12px 14px' : '10px 14px',
                gap: 10,
              }}>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editCategoryValue}
                    onChange={e => setEditCategoryValue(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') await commitEdit()
                      if (e.key === 'Escape') { setEditingCategory(null); setEditCategoryValue('') }
                    }}
                    onBlur={commitEdit}
                    style={{ ...inp, flex: 1, padding: '6px 8px' }}
                    onFocus={focusStyle}
                  />
                ) : (
                  <span style={{ fontSize: isMobile ? 15 : 14, color: '#0f172a', fontWeight: 500, flex: 1 }}>{cat}</span>
                )}

                {!isEditing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => { setEditingCategory(cat); setEditCategoryValue(cat) }}
                      title="Edit category"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#0891b2'; e.currentTarget.style.background = '#e0f2fe' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {expCategories.length > 1 && (
                      <button
                        onClick={async () => {
                          const updated = expCategories.filter(c => c !== cat)
                          setExpCategories(updated)
                          await supabase.from('profiles').update({ expense_categories: JSON.stringify(updated) }).eq('id', user.id)
                          showToast()
                        }}
                        title="Delete category"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {addingCategory ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  const c = newCategory.trim()
                  if (!c || expCategories.includes(c)) return
                  const updated = [...expCategories, c]
                  setExpCategories(updated)
                  setNewCategory('')
                  await supabase.from('profiles').update({ expense_categories: JSON.stringify(updated) }).eq('id', user.id)
                  showToast()
                } else if (e.key === 'Escape') {
                  setAddingCategory(false)
                  setNewCategory('')
                }
              }}
              placeholder="Type a category name…"
              style={{ ...inp, flex: 1 }}
              onFocus={focusStyle} onBlur={blurStyle}
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
              style={{ background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 8, padding: isMobile ? '12px 16px' : '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(20,184,166,0.3)' }}>
              Add
            </button>
            <button
              onClick={() => { setAddingCategory(false); setNewCategory('') }}
              style={{ background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: isMobile ? '12px 16px' : '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingCategory(true)}
            style={{
              width:        '100%',
              padding:      isMobile ? '14px' : '12px',
              border:       '2px dashed #cbd5e1',
              borderRadius: 8,
              background:   'transparent',
              color:        '#64748b',
              fontSize:     14,
              fontWeight:   600,
              cursor:       'pointer',
              transition:   'border-color 0.15s, color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#14b8a6'; e.currentTarget.style.color = '#14b8a6'; e.currentTarget.style.background = '#f0fdfa' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent' }}
          >
            + Add Expense Category
          </button>
        )}

        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          Removing a category does not affect existing expenses that used it.
        </p>
      </Section>

      {/* ── SUBSCRIPTION & BILLING ───────────────────────────────────────── */}
      {showSubPlans && (
        <PlanSelectModal onSelect={handleSubSelectPlan} onClose={() => setShowSubPlans(false)} />
      )}
      <Section
        id="subscription" icon="💳"
        title="Subscription & Billing"
        description="Manage your FundiBill plan and billing"
        isOpen={openSection === 'subscription'}
        onToggle={() => toggleSection('subscription')}
        isMobile={isMobile}
      >
        {(() => {
          const subPlan    = trialStatus?.subscriptionPlan
          const subActive  = trialStatus?.subscriptionActive
          const subExpired = trialStatus?.subscriptionExpired
          const subEndDate = trialStatus?.subscriptionEndDate
          const dbStatus   = currentProfile?.subscription_status
          const daysLeft   = trialStatus?.daysRemaining ?? 0
          const trialEnded = trialStatus?.trialExpired ?? false

          const fmtDate = (d) => d
            ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
            : ''
          const planLabel = { monthly: 'Monthly', annual: 'Annual', lifetime: 'Lifetime' }[subPlan] || 'Plan'

          const cardStyle = (bg, border, borderColor) => ({
            background:   bg,
            border:       `1.5px solid ${borderColor}`,
            borderRadius: 10,
            padding:      16,
            marginBottom: 16,
          })
          const badgeStyle = (bg, color) => ({
            display:      'inline-block',
            background:   bg,
            color,
            borderRadius: 999,
            padding:      '3px 10px',
            fontSize:     12,
            fontWeight:   700,
            marginBottom: 8,
            letterSpacing: '0.02em',
          })
          const descStyle = {
            fontSize: 13,
            color:    '#374151',
            margin:   '4px 0 12px',
            lineHeight: 1.6,
          }
          const btnPrimary = {
            background:   '#14b8a6',
            color:        '#fff',
            border:       'none',
            borderRadius: 7,
            padding:      isMobile ? '11px 20px' : '8px 18px',
            fontSize:     13,
            fontWeight:   700,
            cursor:       'pointer',
            boxShadow:    '0 2px 6px rgba(20,184,166,0.3)',
          }
          const btnRed = {
            background:   'transparent',
            color:        '#dc2626',
            border:       '1.5px solid #fca5a5',
            borderRadius: 7,
            padding:      isMobile ? '11px 20px' : '8px 18px',
            fontSize:     13,
            fontWeight:   600,
            cursor:       'pointer',
          }

          // ── Lifetime ──────────────────────────────────────────────────────
          if (subActive && subPlan === 'lifetime') {
            return (
              <div style={cardStyle('#f0fdf4', '1.5px solid #bbf7d0', '#bbf7d0')}>
                <div style={badgeStyle('#16a34a', '#fff')}>✓ Lifetime License</div>
                <p style={descStyle}>You have lifetime access to FundiBill. No renewals or recurring charges.</p>
              </div>
            )
          }

          // ── Active but cancellation pending (will not renew) ──────────────
          if (subActive && dbStatus === 'cancelled') {
            return (
              <div style={cardStyle('#fffbeb', '1.5px solid #fde68a', '#fde68a')}>
                <div style={badgeStyle('#d97706', '#fff')}>⚠ Cancellation Pending</div>
                <p style={descStyle}>
                  Your {planLabel} subscription has been cancelled. You have full access until{' '}
                  <strong>{fmtDate(subEndDate)}</strong>, after which your account switches to read-only.
                </p>
                <button style={btnPrimary} onClick={() => setShowSubPlans(true)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}>
                  Resubscribe
                </button>
              </div>
            )
          }

          // ── Active subscription ───────────────────────────────────────────
          if (subActive) {
            return (
              <div style={cardStyle('#f0fdfa', '1.5px solid #99f6e4', '#99f6e4')}>
                <div style={badgeStyle('#0d9488', '#fff')}>✓ {planLabel} — Active</div>
                <p style={descStyle}>
                  {subEndDate
                    ? <>Next renewal on <strong>{fmtDate(subEndDate)}</strong>.</>
                    : 'Your subscription is active.'}
                </p>
                <button style={btnRed} onClick={() => setCancelConfirm(true)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  Cancel Subscription
                </button>
              </div>
            )
          }

          // ── Cancelled with no remaining access ────────────────────────────
          if (dbStatus === 'cancelled') {
            return (
              <div style={cardStyle('#f8fafc', '1.5px solid #e2e8f0', '#e2e8f0')}>
                <div style={badgeStyle('#64748b', '#fff')}>Cancelled</div>
                <p style={descStyle}>Your subscription has ended. Resubscribe to restore full access.</p>
                <button style={btnPrimary} onClick={() => setShowSubPlans(true)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}>
                  Resubscribe
                </button>
              </div>
            )
          }

          // ── Expired ───────────────────────────────────────────────────────
          if (subExpired) {
            return (
              <div style={cardStyle('#fff1f2', '1.5px solid #fecdd3', '#fecdd3')}>
                <div style={badgeStyle('#dc2626', '#fff')}>Expired</div>
                <p style={descStyle}>
                  Your {planLabel} subscription expired on <strong>{fmtDate(subEndDate)}</strong>.
                  Renew now to restore full access.
                </p>
                <button style={btnPrimary} onClick={() => setShowSubPlans(true)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}>
                  Renew Now
                </button>
              </div>
            )
          }

          // ── Trial ended ───────────────────────────────────────────────────
          if (trialEnded) {
            return (
              <div style={cardStyle('#fff1f2', '1.5px solid #fecdd3', '#fecdd3')}>
                <div style={badgeStyle('#dc2626', '#fff')}>Free Trial Ended</div>
                <p style={descStyle}>Your 7-day free trial has ended. Choose a plan to continue using FundiBill with full access.</p>
                <button style={btnPrimary} onClick={() => setShowSubPlans(true)}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}>
                  Choose a Plan
                </button>
              </div>
            )
          }

          // ── Trial active ──────────────────────────────────────────────────
          return (
            <div style={cardStyle('#eff6ff', '1.5px solid #bfdbfe', '#bfdbfe')}>
              <div style={badgeStyle('#2563eb', '#fff')}>Free Trial</div>
              <p style={descStyle}>
                You have <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong> remaining in your free trial.
                Choose a plan to unlock full access and keep your data.
              </p>
              <button style={btnPrimary} onClick={() => setShowSubPlans(true)}
                onMouseEnter={e => { e.currentTarget.style.background = '#0d9488' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#14b8a6' }}>
                Choose a Plan
              </button>
            </div>
          )
        })()}

        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 1.6 }}>
          For billing history and tax invoices, log in to your PayFast account at{' '}
          <button
            onClick={() => window.db?.openExternal('https://www.payfast.co.za')}
            style={{ background: 'none', border: 'none', color: '#0891b2', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline', fontFamily: 'inherit' }}
          >
            payfast.co.za
          </button>.
        </p>

        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, lineHeight: 1.6 }}>
          By subscribing you agree to the FundiBill{' '}
          <button
            onClick={() => window.db?.openExternal('https://fundibill.online/terms')}
            style={{ background: 'none', border: 'none', color: '#0891b2', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline', fontFamily: 'inherit' }}
          >
            Terms of Service
          </button>
          {' '}and{' '}
          <button
            onClick={() => window.db?.openExternal('https://fundibill.online/privacy')}
            style={{ background: 'none', border: 'none', color: '#0891b2', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline', fontFamily: 'inherit' }}
          >
            Privacy Policy
          </button>.
        </p>
      </Section>

      {/* ── Cancel subscription confirm modal ────────────────────────────── */}
      {cancelConfirm && (
        <div style={{
          position:       'fixed',
          inset:          0,
          background:     'rgba(15,23,42,0.5)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          zIndex:         1000,
          padding:        16,
        }}>
          <div style={{
            background:   '#fff',
            borderRadius: 12,
            padding:      24,
            maxWidth:     380,
            width:        '100%',
            boxShadow:    '0 12px 40px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Cancel Subscription?
            </h3>
            <p style={{ margin: '0 0 6px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              Your subscription will be cancelled. You'll keep full access until the end of your current billing period.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              You can resubscribe at any time from the Subscription & Billing section.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setCancelConfirm(false)}
                disabled={cancelling}
                style={{
                  padding:      '9px 18px',
                  borderRadius: 8,
                  border:       '1.5px solid #e2e8f0',
                  background:   '#fff',
                  color:        '#374151',
                  fontWeight:   600,
                  fontSize:     13,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                }}
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                style={{
                  padding:      '9px 18px',
                  borderRadius: 8,
                  border:       'none',
                  background:   cancelling ? '#94a3b8' : '#dc2626',
                  color:        '#fff',
                  fontWeight:   600,
                  fontSize:     13,
                  cursor:       cancelling ? 'wait' : 'pointer',
                  fontFamily:   'inherit',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          6,
                }}
              >
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE: Sign Out button (at bottom of scrollable content) ────── */}
      {isMobile && (
        <div style={{ marginTop: 8, marginBottom: 24 }}>
          <button
            onClick={signOut}
            style={{
              width:        '100%',
              height:       52,
              border:       '2px solid #ef4444',
              borderRadius: 8,
              background:   'transparent',
              color:        '#ef4444',
              fontWeight:   600,
              fontSize:     16,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          8,
              fontFamily:   'inherit',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out of FundiBill
          </button>
        </div>
      )}

      {/* ── Unsaved changes confirmation modal ────────────────────────────── */}
      {pendingNav && (
        <div style={{
          position:       'fixed',
          inset:          0,
          background:     'rgba(15,23,42,0.5)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          zIndex:         1000,
          padding:        16,
        }}>
          <div style={{
            background:   '#fff',
            borderRadius: 12,
            padding:      24,
            maxWidth:     360,
            width:        '100%',
            boxShadow:    '0 12px 40px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Unsaved Changes
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
              You have unsaved changes. Leave without saving?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setPendingNav(null)}
                style={{
                  padding:      '9px 18px',
                  borderRadius: 8,
                  border:       '1.5px solid #e2e8f0',
                  background:   '#fff',
                  color:        '#374151',
                  fontWeight:   600,
                  fontSize:     13,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                }}
              >
                Stay
              </button>
              <button
                onClick={() => {
                  const dest = pendingNav
                  setPendingNav(null)
                  navigate(dest)
                }}
                style={{
                  padding:      '9px 18px',
                  borderRadius: 8,
                  border:       'none',
                  background:   '#dc2626',
                  color:        '#fff',
                  fontWeight:   600,
                  fontSize:     13,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast visible={toastVisible} />

      {gmailToast && (
        <div style={{
          position:   'fixed',
          bottom:     28,
          right:      28,
          background: gmailToast.type === 'error' ? '#7f1d1d' : '#0f172a',
          color:      gmailToast.type === 'error' ? '#fca5a5' : '#4ade80',
          border:     gmailToast.type === 'error' ? '1px solid rgba(252,165,165,0.25)' : '1px solid rgba(74,222,128,0.25)',
          borderRadius: 8,
          padding:    '10px 16px',
          fontSize:   13,
          fontWeight: 600,
          maxWidth:   340,
          zIndex:     200,
          boxShadow:  '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {gmailToast.type === 'error' ? '⚠ ' : '✓ '}{gmailToast.message}
        </div>
      )}
    </div>
  )
}
