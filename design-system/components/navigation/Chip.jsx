import React from 'react';
export function Chip({ active = false, onClick, children, tone = 'light' }) {
  const onDark = tone === 'dark';
  return (
    <button onClick={onClick} style={{ height: 'var(--h-chip)', padding: '0 18px', borderRadius: 'var(--r-pill)', border: 0, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
      font: (active ? '600' : '400') + ' 14px/1 var(--font-sans)',
      background: active ? (onDark ? 'var(--cn-branco)' : 'var(--action-primary)') : (onDark ? 'transparent' : 'var(--cn-papel)'),
      color: active ? (onDark ? 'var(--cn-tinta)' : 'var(--text-inverse)') : (onDark ? 'rgba(255,255,255,.72)' : 'var(--text-meta)'),
      transition: 'background var(--dur-base) var(--ease-standard), color var(--dur-base) var(--ease-standard)' }}>{children}</button>
  );
}
export function ChipGroup({ items, value, onChange, tone = 'light', style }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', ...style }}>
      {items.map((it) => <Chip key={it} tone={tone} active={it === value} onClick={() => onChange && onChange(it)}>{it}</Chip>)}
    </div>
  );
}
