const btn = (disabled) => ({
  width: 34, height: 34, padding: 0, borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#fff', color: disabled ? '#cbd5e1' : '#475569',
  cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
})

export default function LineMoveButtons({ index, count, onMove, style }) {
  const upDisabled = index === 0
  const downDisabled = index === count - 1
  return (
    <span style={{ display: 'inline-flex', gap: 4, ...style }}>
      <button type="button" aria-label="Move line up" title="Move line up" disabled={upDisabled}
        onClick={() => onMove(-1)} style={btn(upDisabled)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg>
      </button>
      <button type="button" aria-label="Move line down" title="Move line down" disabled={downDisabled}
        onClick={() => onMove(1)} style={btn(downDisabled)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </span>
  )
}
