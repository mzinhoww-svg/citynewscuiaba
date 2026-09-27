import React from 'react';
export function Tabs({ items, value, defaultValue, onChange, style }) {
  const [inner, setInner] = React.useState(defaultValue ?? items[0]);
  const cur = value ?? inner;
  return (
    <div style={{ display: 'flex', gap: 8, ...style }}>
      {items.map((it) => { const a = it === cur; return (
        <button key={it} onClick={() => { setInner(it); onChange && onChange(it); }} style={{ flex: 1, height: 36, borderRadius: 'var(--r-pill)', border: 0, cursor: 'pointer',
          background: a ? 'var(--action-primary)' : 'var(--cn-papel)', color: a ? 'var(--text-inverse)' : 'var(--text-meta)', font: (a ? '600' : '500') + ' 14px/1 var(--font-sans)' }}>{it}</button>); })}
    </div>
  );
}
