import React from 'react';
import { Icon } from '../icons/Icon.jsx';
export function SegmentedToggle({ options, value, defaultValue, onChange }) {
  const [inner, setInner] = React.useState(defaultValue ?? options[0].value);
  const cur = value ?? inner;
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 999, background: 'var(--cn-papel)' }}>
      {options.map((o) => { const a = o.value === cur; return (
        <button key={o.value} aria-label={o.label} onClick={() => { setInner(o.value); onChange && onChange(o.value); }}
          style={{ height: 28, minWidth: 28, padding: o.icon ? 0 : '0 12px', border: 0, borderRadius: 999, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: a ? 'var(--cn-branco)' : 'transparent', boxShadow: a ? 'var(--shadow-sm)' : 'none', color: a ? 'var(--text-link)' : 'var(--text-meta)', font: '600 12px/1 var(--font-sans)' }}>
          {o.icon && <Icon name={o.icon} size={14} />}{!o.icon && o.label}
        </button>); })}
    </div>
  );
}
