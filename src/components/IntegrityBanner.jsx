import { INTEGRITY_MESSAGE } from '../utils/documentSave'

export default function IntegrityBanner({ integrity }) {
  if (!integrity || integrity.ok) return null
  const money = n => 'R ' + (Number(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div role="alert" style={{
      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
      padding: '12px 16px', marginBottom: 16, color: '#991b1b', fontSize: 13, lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{INTEGRITY_MESSAGE}</div>
      <div>
        Stored total {money(integrity.storedTotal)}; the {integrity.itemCount} saved line{integrity.itemCount === 1 ? '' : 's'} add up to {money(integrity.itemsTotal)}.
        Sending, sharing and PDF download are disabled until the lines are fixed and the document is saved again.
      </div>
    </div>
  )
}
