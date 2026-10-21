import { useState } from 'react'

// True when a saved document has several lines but no recorded order: every
// line shares one sort_order (or all are NULL).
export function hasUnrecordedLineOrder(items) {
  if (!Array.isArray(items) || items.length < 2) return false
  const first = items[0].sort_order ?? null
  return items.every(i => (i.sort_order ?? null) === first)
}

export default function LineOrderNotice({ items }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || !hasUnrecordedLineOrder(items)) return null
  return (
    <div role="status" style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between',
      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
      padding: '10px 14px', color: '#92400e', fontSize: 13, lineHeight: 1.5,
    }}>
      <span>The original line order for this document wasn't recorded. Use the arrows to arrange the lines, then save.</span>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}
