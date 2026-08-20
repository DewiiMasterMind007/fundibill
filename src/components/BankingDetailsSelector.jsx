import { useNavigate } from 'react-router-dom'

// Used by the invoice and estimate creation/edit forms. With zero or one saved
// banking account there's nothing to choose, so it collapses to a read-only
// line; with two or more it becomes a real selector.
export default function BankingDetailsSelector({ bankingDetails, value, onChange }) {
  const navigate = useNavigate()

  const linkStyle = {
    color: 'var(--primary, #14b8a6)', cursor: 'pointer',
    textDecoration: 'underline', textUnderlineOffset: 2, fontWeight: 600,
  }

  if (!bankingDetails || bankingDetails.length === 0) {
    return (
      <div style={{ fontSize: 13, color: '#94a3b8' }}>
        No banking details saved.{' '}
        <span onClick={() => navigate('/settings')} style={linkStyle}>Add banking details</span>
      </div>
    )
  }

  if (bankingDetails.length === 1) {
    const b = bankingDetails[0]
    return (
      <div style={{ fontSize: 13, color: '#64748b' }}>
        Bank: {b.bank_name || '—'} | Acc: {b.account_number || '—'}{' '}
        <span onClick={() => navigate('/settings')} style={{ ...linkStyle, marginLeft: 6, fontSize: 12 }}>
          Manage banking details
        </span>
      </div>
    )
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
        Banking Details
      </label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
          border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a',
          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      >
        {bankingDetails.map(b => (
          <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</option>
        ))}
      </select>
    </div>
  )
}
