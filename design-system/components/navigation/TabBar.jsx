import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function TabBar({ items, value, onChange, style }) {
  return (
    <nav style={{ display: 'flex', height: 'var(--h-tabbar)', background: 'var(--cn-branco)', borderTop: '1px solid var(--border-subtle)', ...style }}>
      {items.map((it) => { const a = it.id === value; return (
        <button key={it.id} onClick={() => onChange && onChange(it.id)} style={{ flex: 1, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          color: a ? 'var(--text-link)' : 'var(--text-placeholder)', font: (a ? '600' : '500') + ' 12px/1 var(--font-sans)', position: 'relative' }}>
          {a && <span style={{ position: 'absolute', top: 0, width: 24, height: 3, borderRadius: '0 0 3px 3px', background: 'var(--accent)' }} />}
          <Icon name={it.icon} size={24} fill={a && it.fillActive ? 'currentColor' : 'none'} />{it.label}
        </button>); })}
    </nav>
  );
}
